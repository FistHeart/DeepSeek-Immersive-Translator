/**
 * Article Translator v7.0 — per-paragraph individual translation.
 *
 * Each paragraph element is treated as an INDEPENDENT translation task:
 *   extract own text → request own translation → inject own result.
 * NO batch merging, NO cross-paragraph aggregation, NO shared result strings.
 *
 * Processing flow:
 *   1. detect(el) → attach RED indicator
 *   2. queue for processing (60ms debounce to collect adjacent detects)
 *   3. process individually: each paragraph gets its own Translator.translate() call
 *   4. inject result directly below the original element
 *
 * Concurrency: max 3 parallel requests. Prevents API rate limiting while
 * keeping translation fast. Failed paragraphs are retried individually.
 *
 * State lifecycle: detected(RED) → loading(spinner) → success(GREEN) / error(RED warning)
 */

/** Elements whose parent cannot contain a <div> as a direct child */
const RESTRICTED_PARENTS = new Set(['UL', 'OL', 'TR', 'TBODY', 'THEAD', 'TFOOT', 'TABLE', 'DL']);

const ArticleTranslator = {
  _active: false, _observer: null, _seen: new WeakSet(),
  _blockId: 0, _totalTranslated: 0,
  _watchdogActive: false,

  // Processing queue — each paragraph translated individually
  _queue: [],
  _queueTimer: null,
  _processing: false,
  _maxConcurrent: 3,

  async start() {
    if (this._active) return;
    this._active = true;
    ParaState.setRetryCallback((el) => this._translateOne(el));
    ParaState.setToggleCallbacks({
      onCollapse: (el) => this._collapseParagraph(el),
      onExpand: (el) => this._expandParagraph(el),
      onTranslate: (el) => this._translateOne(el)
    });
    await DOMHandler.waitForPageReady();
    console.log('[DTI] === Article Translation v7.0 started (per-paragraph isolated) ===');
    this._initScan();
    this._startWatchdog();
  },

  stop() {
    this._active = false;
    clearTimeout(this._queueTimer); this._queueTimer = null;
    this._queue = []; this._processing = false;
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    this._seen = new WeakSet();
    ParaState.setToggleCallbacks({});
    if (this._watchdogActive) { TransWatchdog.stop(); this._watchdogActive = false; }
    ParaState.clearAll();
    document.querySelectorAll('.ds-art-block').forEach(e => e.remove());
    document.querySelectorAll('[data-ds-art]').forEach(e => e.removeAttribute('data-ds-art'));
    console.log('[DTI] Article Translation stopped — total translated:', this._totalTranslated);
    this._totalTranslated = 0;
  },

  // ── Initialization ──────────────────────────────────

  _initScan() {
    const root = this._getRoot(), sels = this._getSelectors();
    if (!root) { console.log('[DTI] Article scan skipped — no content root'); return; }
    const nodes = root.querySelectorAll(sels);
    let detected = 0;
    for (const el of nodes) {
      if (!Utils.isContentArea(el)) continue;
      const t = el.textContent.trim();
      if (t.length < 20 || t.length > 5000) continue;
      if (!Classifier.isParagraph(t, el)) continue;
      if (this._seen.has(el)) continue;
      this._seen.add(el);
      ParaState.attach(el, 'detected');
      this._enqueue(el, 'auto');
      detected++;
    }
    console.log('[DTI] Initial scan:', detected, 'paragraphs queued for individual translation');

    this._observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        if (this._seen.has(el)) { this._observer.unobserve(el); continue; }
        this._seen.add(el);
        const t = el.textContent.trim();
        if (t.length >= 20 && t.length <= 5000 && Utils.isContentArea(el) && Classifier.isParagraph(t, el)) {
          ParaState.attach(el, 'detected');
          this._enqueue(el, 'auto');
        }
      }
    }, { rootMargin: '500px 0px' });

    for (const el of nodes) {
      if (Utils.isContentArea(el) && el.textContent.trim().length >= 20)
        this._observer.observe(el);
    }
  },

  // ── Queue (debounced individual processing) ──────────

  /**
   * Enqueue a single paragraph for translation.
   * Each paragraph will be translated INDEPENDENTLY — no batch merge.
   */
  _enqueue(el, source) {
    if (!el.isConnected) return;
    if (this._queue.some(q => q.element === el)) return;

    this._queue.push({ element: el, source });
    clearTimeout(this._queueTimer);
    this._queueTimer = setTimeout(() => this._processQueue(), 60);
  },

  /**
   * Process all queued paragraphs INDIVIDUALLY with controlled concurrency.
   * Each paragraph → own Translator.translate() call → own injection point.
   * Failed paragraphs remain in error state for retry/watchdog recovery.
   */
  async _processQueue() {
    if (this._processing || !this._queue.length || !this._active) return;
    this._processing = true;

    // Take all pending items, deduplicate by element
    const items = this._queue.splice(0);
    const seen = new Set();
    const deduped = [];
    for (const item of items) {
      if (seen.has(item.element)) continue;
      seen.add(item.element);
      if (!item.element.isConnected) continue;
      if (ParaState.hasTranslation(item.element)) continue;
      const st = ParaState.getState(item.element);
      if (st && (st.state === 'loading' || st.state === 'success')) continue;
      deduped.push(item);
    }

    if (!deduped.length) { this._processing = false; return; }
    console.log('[DTI] Processing queue:', deduped.length, 'paragraphs individually');

    // Process in chunks of _maxConcurrent for API rate limiting
    for (let i = 0; i < deduped.length; i += this._maxConcurrent) {
      if (!this._active) break;
      const chunk = deduped.slice(i, i + this._maxConcurrent);
      const results = await Promise.allSettled(
        chunk.map(item => this._translateOne(item.element))
      );
      for (let j = 0; j < results.length; j++) {
        if (results[j].status === 'rejected') {
          ParaState.transition(chunk[j].element, 'error');
          console.error('[DTI] Individual translation rejected:', results[j].reason?.message);
        }
      }
    }

    this._processing = false;
    // Process any items that arrived during this batch
    if (this._queue.length) {
      clearTimeout(this._queueTimer);
      this._queueTimer = setTimeout(() => this._processQueue(), 60);
    }
    if (this._watchdogActive) TransWatchdog.poke();
  },

  // ── Watchdog ────────────────────────────────────────

  _startWatchdog() {
    if (this._watchdogActive) return;
    TransWatchdog.start({
      onStuck: (stuckElements) => {
        for (const el of stuckElements) this._translateOne(el);
      },
      onVisibleUntranslated: (visibleElements) => {
        for (const el of visibleElements) this._enqueue(el, 'auto');
      },
      onQueueFlush: () => {
        if (!this._processing) this._processQueue();
      }
    });
    this._watchdogActive = true;
  },

  // ── PER-PARAGRAPH TRANSLATION ────────────────────────
  //
  //  CRITICAL: Each paragraph element is translated as an ISOLATED unit.
  //  Only el.textContent is extracted. Only its translation is returned.
  //  No text from other paragraphs is included. No merged results.

  /**
   * Translate a SINGLE paragraph element.
   * Extract its own text → translate it → inject below it.
   * This is the ONLY translation path. No batch, no merge, no shared results.
   */
  async _translateOne(el) {
    if (!this._active || !el.isConnected) return;
    const t = el.textContent.trim();
    if (t.length < 20 || t.length > 5000) return;
    if (ParaState.hasTranslation(el)) return;

    const st = ParaState.getState(el);
    if (st && st.state === 'loading') return;

    ParaState.transition(el, 'loading');
    console.log('[DTI] Translating individual paragraph: chars=' + t.length + ' tag=' + el.tagName);

    try {
      const prefs = await Storage.getPreferences();
      const v = TransValidator.validate(t, prefs.targetLang, 'article');
      if (!v.valid) { ParaState.transition(el, 'error'); return; }

      // Individual translation — NO batch, NO merge
      const cached = await TransCache.get(t, prefs.targetLang);
      const tr = cached || await Translator.translate(t, prefs.targetLang);

      // Validate: result must be meaningful and not equal to source
      if (tr && tr !== t && tr.length > 3) {
        this._removeExistingBlock(el);
        this._safeInject(el, tr);
        ParaState.transition(el, 'success');
        this._totalTranslated++;
        console.log('[DTI] ✓ Paragraph translated: chars=' + t.length + ' → ' + tr.length);
      } else {
        ParaState.transition(el, 'error');
        console.warn('[DTI] ✗ Empty/same translation');
      }
    } catch (e) {
      ParaState.transition(el, 'error');
      console.error('[DTI] Paragraph translation failed:', e.message);
    }
  },

  // ── Safe DOM Injection ──────────────────────────────

  _safeInject(el, translation) {
    if (el.hasAttribute('data-ds-art')) return;
    const id = 'b' + (++this._blockId);
    el.setAttribute('data-ds-art', id);
    const parent = el.parentElement;
    const parentTag = parent ? parent.tagName : '';
    const isRestricted = RESTRICTED_PARENTS.has(parentTag);

    const block = document.createElement('div');
    block.className = isRestricted ? 'ds-art-block ds-art-block--child' : 'ds-art-block';
    block.setAttribute('data-ds-art-id', id);
    block.innerHTML =
      '<span class="ds-art-text">' + Utils.escHTML(translation) + '</span>' +
      '<span class="ds-art-retry" data-id="' + id + '" title="重译此段">&#x21bb;</span>';
    block.querySelector('.ds-art-retry').onclick = (e) => {
      e.stopPropagation();
      const te = block.querySelector('.ds-art-text');
      if (te) this._retryBlock(el, te);
    };

    if (isRestricted) {
      el.appendChild(block);
    } else {
      el.insertAdjacentElement('afterend', block);
    }

    ParaState.setTranslation(el, translation);
    ParaState._setBlock(el, block);
    console.log('[DTI] Injected block: tag=' + el.tagName + ' parent=' + parentTag + ' id=' + id);
  },

  async _retryBlock(el, textEl) {
    textEl.textContent = '...';
    try {
      const t = await Translator.translate(el.textContent.trim(), (await Storage.getPreferences()).targetLang);
      if (t) { textEl.textContent = t; ParaState.setTranslation(el, t); }
    } catch { textEl.textContent = '重试失败'; }
  },

  _removeExistingBlock(el) {
    const block = ParaState._getBlock(el);
    if (block?.isConnected) { block.remove(); ParaState._clearBlock(el); return; }
    const artId = el.getAttribute('data-ds-art');
    if (artId) {
      const orphan = document.querySelector('[data-ds-art-id="' + artId + '"]');
      if (orphan) orphan.remove();
    }
    el.removeAttribute('data-ds-art');
  },

  // ── Toggle Visibility ───────────────────────────────

  _collapseParagraph(el) {
    const block = ParaState._getBlock(el);
    if (block?.isConnected) {
      block.classList.add('ds-art-collapsing');
      const b = block;
      ParaState._clearBlock(el);
      setTimeout(() => { if (b.isConnected) b.remove(); }, 300);
    }
    ParaState.transition(el, 'detected');
    console.log('[DTI] Paragraph collapsed');
  },

  _expandParagraph(el) {
    const cached = ParaState.getTranslation(el);
    if (!cached) { this._translateOne(el); return; }
    this._removeExistingBlock(el);
    this._safeInject(el, cached);
    ParaState.transition(el, 'success');
    console.log('[DTI] Paragraph restored from cache');
  },

  // ── Dynamic Content ─────────────────────────────────

  feedNewNodes(nodes) {
    if (!this._active) return;
    const sels = this._getSelectors();
    let paraCount = 0;
    for (const n of nodes) {
      if (n.nodeType !== 1) continue;
      for (const el of (n.querySelectorAll ? n.querySelectorAll(sels) : [])) {
        if (this._seen.has(el)) continue;
        if (!Utils.isContentArea(el)) continue;
        const t = el.textContent.trim();
        if (t.length < 20 || t.length > 5000) continue;
        if (!Classifier.isParagraph(t, el)) continue;
        this._seen.add(el);
        this._observer?.observe(el);
        ParaState.attach(el, 'detected');
        this._enqueue(el, 'auto');
        paraCount++;
      }
    }
    if (paraCount) {
      console.log('[DTI] Dynamic content: paragraphs=', paraCount);
      if (this._watchdogActive) TransWatchdog.poke();
    }
  },

  // ── Helpers ─────────────────────────────────────────

  _getRoot() {
    const h = location.hostname;
    for (const a of [AdapterReddit, AdapterTwitter, AdapterMedium, AdapterArxiv, AdapterWikipedia])
      if (a.match(h)) return a.getContentRoot();
    return Readability.findMainContent();
  },

  _getSelectors() {
    const h = location.hostname;
    for (const a of [AdapterReddit, AdapterTwitter, AdapterMedium, AdapterArxiv, AdapterWikipedia])
      if (a.match(h)) return a.getSelectors();
    return 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption';
  }
};
