/**
 * Article Translator v6.5 — dual-path: _translateOne (manual) + _startLifecycle (auto batch).
 *
 * Single translation entry point: _startLifecycle(el, source)
 *   - 'auto'  → auto-trigger on RED indicator insert, micro-batched via 60ms timer
 *   - 'manual'→ RED click handler, flushes immediately
 *   - 'retry' → error recovery, watchdog, safety net
 *
 * State lifecycle: detected(RED) → loading(spinner) → success(GREEN) / error(RED warning)
 *   GREEN click → collapse, hide translation, return to RED (cached)
 *   RED click (cached) → restore translation, return to GREEN
 *   RED click (uncached) → _startLifecycle(el, 'manual')
 *
 * v6.5 — Safe DOM injection: handles restricted parents (ul/ol/tr/tbody)
 *   where inserting a <div> sibling creates invalid HTML. Stores direct block
 *   references in ParaState to avoid nextElementSibling position-dependent bugs.
 */

/** Elements whose parent cannot contain a <div> as a direct child */
const RESTRICTED_PARENTS = new Set(['UL', 'OL', 'TR', 'TBODY', 'THEAD', 'TFOOT', 'TABLE', 'DL']);

const ArticleTranslator = {
  _active: false, _observer: null, _seen: new WeakSet(),
  _blockId: 0, _totalTranslated: 0,
  _watchdogActive: false,

  // Shared lifecycle state
  _lifecycleBatch: [],    // elements queued for batch translation
  _lifecycleTimer: null,  // 60ms batch window timer
  _triggered: new WeakSet(), // prevents double auto-trigger per element

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

    console.log('[DTI] === Article Translation v6.5 started (safe-injection) ===');

    this._initScan();
    this._startWatchdog();
  },

  stop() {
    this._active = false;
    clearTimeout(this._lifecycleTimer); this._lifecycleTimer = null;
    this._lifecycleBatch = [];
    this._triggered = new WeakSet();

    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    this._seen = new WeakSet();

    ParaState.setToggleCallbacks({});
    if (this._watchdogActive) { TransWatchdog.stop(); this._watchdogActive = false; }

    ParaState.clearAll();
    document.querySelectorAll('.ds-art-block, .ds-art-li').forEach(e => e.remove());
    document.querySelectorAll('[data-ds-art]').forEach(e => e.removeAttribute('data-ds-art'));

    console.log('[DTI] Article Translation stopped — total translated:', this._totalTranslated);
    this._totalTranslated = 0;
  },

  // ── Initialization ──────────────────────────────────

  _initScan() {
    const root = this._getRoot(), sels = this._getSelectors();
    if (!root) { console.log('[DTI] Article scan skipped — no content root for this page'); return; }
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
      console.log('[DTI] Paragraph detected: wordCount=', Classifier.englishWordCount(t), 'type=article tag=' + el.tagName);

      this._startLifecycle(el, 'auto');
      detected++;
    }
    console.log('[DTI] Initial scan:', detected, 'paragraphs → auto-triggering lifecycle');

    // IntersectionObserver for viewport-triggered lazy content
    this._observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        if (this._seen.has(el)) { this._observer.unobserve(el); continue; }
        this._seen.add(el);
        const t = el.textContent.trim();
        if (t.length >= 20 && t.length <= 5000 && Utils.isContentArea(el) && Classifier.isParagraph(t, el)) {
          ParaState.attach(el, 'detected');
          this._startLifecycle(el, 'auto');
        }
      }
    }, { rootMargin: '500px 0px' });

    for (const el of nodes) {
      if (Utils.isContentArea(el) && el.textContent.trim().length >= 20)
        this._observer.observe(el);
    }
  },

  // ── Watchdog ────────────────────────────────────────

  _startWatchdog() {
    if (this._watchdogActive) return;

    TransWatchdog.start({
      onStuck: (stuckElements) => {
        console.log('[DTI] Watchdog recovery triggered: count=', stuckElements.length);
        for (const el of stuckElements) this._translateOne(el);
      },
      onVisibleUntranslated: (visibleElements) => {
        console.log('[DTI] Visible paragraph force-scheduled: count=', visibleElements.length);
        for (const el of visibleElements) this._startLifecycle(el, 'auto');
      },
      onQueueFlush: () => {
        if (this._lifecycleBatch.length) this._flushLifecycle();
      }
    });

    this._watchdogActive = true;
  },

  // ── DIRECT TRANSLATION (manual RED click, retry, error recovery) ──

  async _translateOne(el) {
    if (!this._active || !el.isConnected) return;
    const t = el.textContent.trim();
    if (t.length < 20 || t.length > 5000) return;
    if (ParaState.hasTranslation(el)) return;

    const st = ParaState.getState(el);
    if (st && st.state === 'loading') return;

    ParaState.transition(el, 'loading');

    try {
      const prefs = await Storage.getPreferences();
      const v = TransValidator.validate(t, prefs.targetLang, 'article');
      if (!v.valid) { ParaState.transition(el, 'error'); return; }

      const cached = await TransCache.get(t, prefs.targetLang);
      const tr = cached || await Translator.translate(t, prefs.targetLang);
      if (tr && tr !== t && tr.length > 3) {
        this._removeExistingBlock(el);
        this._safeInject(el, tr);
        ParaState.transition(el, 'success');
        this._totalTranslated++;
        console.log('[DTI] ✓ Direct translation success:', t.substring(0, 50) + '...');
      } else {
        ParaState.transition(el, 'error');
      }
    } catch (e) {
      ParaState.transition(el, 'error');
      console.error('[DTI] Direct translation failed:', e.message);
    }
  },

  // ── AUTO-TRIGGER TRANSLATION ────────────────────────

  _startLifecycle(el, source) {
    if (!this._active) return;
    if (!el.isConnected) return;

    const t = el.textContent.trim();
    if (t.length < 20 || t.length > 5000) return;

    if (source === 'auto') {
      if (this._triggered.has(el)) return;
      this._triggered.add(el);
    }

    if (ParaState.hasTranslation(el)) return;

    const st = ParaState.getState(el);
    if (st && (st.state === 'loading' || st.state === 'success')) return;

    if (!this._lifecycleBatch.some(b => b.element === el)) {
      this._lifecycleBatch.push({ element: el, text: t, source });
    }

    if (source === 'auto') {
      clearTimeout(this._lifecycleTimer);
      this._lifecycleTimer = setTimeout(() => this._flushLifecycle(), 60);
    } else {
      clearTimeout(this._lifecycleTimer);
      this._flushLifecycle();
    }
  },

  async _flushLifecycle() {
    if (!this._lifecycleBatch.length || !this._active) return;
    const batch = this._lifecycleBatch.splice(0);
    if (!batch.length) return;

    console.log('[DTI] Flushing lifecycle batch:', batch.length, 'paragraphs');

    for (const item of batch) {
      ParaState.transition(item.element, 'loading');
    }

    const prefs = await Storage.getPreferences();
    const texts = batch.map(b => b.text);

    try {
      const translations = await Translator.translateBatch(texts, prefs.targetLang);
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i], translation = translations[i];

        // Re-verify element is still connected before injecting
        if (!item.element.isConnected) {
          console.warn('[DTI] Element disconnected, skipping injection');
          continue;
        }

        // Re-read current text for validation (catches changed content)
        const currentText = item.element.textContent.trim();

        if (translation && translation !== currentText && translation !== item.text && translation.length > 3) {
          this._removeExistingBlock(item.element);
          this._safeInject(item.element, translation);
          ParaState.transition(item.element, 'success');
          this._totalTranslated++;
          console.log('[DTI] ✓ Translated (source=', item.source, '):', item.text.substring(0, 50) + '...');
        } else {
          ParaState.transition(item.element, 'error');
          console.warn('[DTI] ✗ Invalid translation for:', item.text.substring(0, 50));
        }
      }
    } catch (e) {
      console.error('[DTI] Lifecycle batch failed:', e.message);
      for (const item of batch) {
        if (item.element.isConnected) {
          ParaState.transition(item.element, 'error');
        }
      }
    }

    if (this._watchdogActive) TransWatchdog.poke();
  },

  // ── Safe DOM Injection ──────────────────────────────
  //
  //  The core fix for "translation injected into wrong paragraph":
  //
  //  For elements whose parent cannot contain a <div> child (UL, OL, TR, TBODY,
  //  THEAD, TFOOT, TABLE, DL), inserting a <div> via insertAdjacentElement
  //  creates invalid HTML. Browsers restructure the DOM, moving blocks to
  //  unpredictable positions. This breaks the 1:1 correspondence.
  //
  //  Solution:
  //    - Restricted parents → append as child inside element (valid HTML)
  //    - All other parents   → insertAdjacentElement('afterend', block)
  //    - Store direct reference in ParaState (never rely on nextElementSibling)

  /**
   * Inject translation block at the correct position relative to el.
   * Automatically detects restricted parent contexts and uses safe insertion.
   */
  _safeInject(el, translation) {
    if (el.hasAttribute('data-ds-art')) return;

    const id = 'b' + (++this._blockId);
    el.setAttribute('data-ds-art', id);

    const parent = el.parentElement;
    const parentTag = parent ? parent.tagName : '';

    // ── Restricted parent: append inside element, not as sibling ──
    //     ul/ol → <li> parent; tr/tbody/thead/tfoot → <td>/<th> parent
    if (RESTRICTED_PARENTS.has(parentTag)) {
      const block = document.createElement('div');
      block.className = 'ds-art-block ds-art-block--child';
      block.setAttribute('data-ds-art-id', id);
      block.innerHTML =
        '<span class="ds-art-text">' + Utils.escHTML(translation) + '</span>' +
        '<span class="ds-art-retry" data-id="' + id + '" title="重译此段">&#x21bb;</span>';
      block.querySelector('.ds-art-retry').onclick = (e) => {
        e.stopPropagation();
        const te = block.querySelector('.ds-art-text');
        if (te) this._retryBlock(el, te, block);
      };
      el.appendChild(block);
      ParaState.setTranslation(el, translation);
      ParaState._setBlock(el, block);
      console.log('[DTI] Injected block (child mode): tag=' + el.tagName + ' parent=' + parentTag + ' id=' + id);
      return;
    }

    // ── Normal parent: insert as sibling (afterend) ──
    const block = document.createElement('div');
    block.className = 'ds-art-block';
    block.setAttribute('data-ds-art-id', id);
    block.innerHTML =
      '<span class="ds-art-text">' + Utils.escHTML(translation) + '</span>' +
      '<span class="ds-art-retry" data-id="' + id + '" title="重译此段">&#x21bb;</span>';
    block.querySelector('.ds-art-retry').onclick = (e) => {
      e.stopPropagation();
      const te = block.querySelector('.ds-art-text');
      if (te) this._retryBlock(el, te, block);
    };

    el.insertAdjacentElement('afterend', block);
    ParaState.setTranslation(el, translation);
    ParaState._setBlock(el, block);
    console.log('[DTI] Injected block (sibling mode): tag=' + el.tagName + ' id=' + id);
  },

  /** Retry button handler — re-translate and update block text */
  async _retryBlock(el, textEl, block) {
    textEl.textContent = '...';
    try {
      const t = await Translator.translate(el.textContent.trim(), (await Storage.getPreferences()).targetLang);
      if (t) { textEl.textContent = t; ParaState.setTranslation(el, t); }
    } catch { textEl.textContent = '重试失败'; }
  },

  /**
   * Remove any existing translation block for an element.
   * Uses direct reference (fast path) with DOM fallback.
   */
  _removeExistingBlock(el) {
    // Fast path: direct reference stored in ParaState
    const block = ParaState._getBlock(el);
    if (block?.isConnected) { block.remove(); ParaState._clearBlock(el); return; }

    // DOM fallback: find by data-ds-art-id
    const artId = el.getAttribute('data-ds-art');
    if (artId) {
      const orphan = document.querySelector('[data-ds-art-id="' + artId + '"]');
      if (orphan) orphan.remove();
    }
    el.removeAttribute('data-ds-art');
  },

  // ── Toggle Visibility ───────────────────────────────

  _collapseParagraph(el) {
    // Use direct block reference — never rely on nextElementSibling
    const block = ParaState._getBlock(el);
    if (block?.isConnected) {
      block.classList.add('ds-art-collapsing');
      const b = block;
      ParaState._clearBlock(el);
      setTimeout(() => { if (b.isConnected) b.remove(); }, 300);
    }
    ParaState.transition(el, 'detected');
    console.log('[DTI] Paragraph collapsed: cacheReuse=true');
  },

  _expandParagraph(el) {
    const cached = ParaState.getTranslation(el);
    if (!cached) { this._translateOne(el); return; }

    this._removeExistingBlock(el);
    this._safeInject(el, cached);
    ParaState.transition(el, 'success');
    console.log('[DTI] Paragraph translation restored: fromCache=true');
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
        this._startLifecycle(el, 'auto');
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
