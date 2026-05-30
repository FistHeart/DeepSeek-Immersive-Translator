/**
 * Article Translator v5.2 — 正文翻译全自动段落翻译流水线。
 *
 * Key improvements over v4:
 *   - Direct queue flush (no microtask scheduling — reliable in content scripts)
 *   - Translation watchdog integration (RED deadlock prevention)
 *   - Viewport-priority scheduling (visible > near > far)
 *   - Auto-recovery: RED > 4s → automatic retry
 *   - Phrase translation sub-system (YELLOW square, click-to-translate)
 *   - Toggleable translation visibility (GREEN→collapse, RED→restore)
 *   - Visible content guarantee
 *   - Queue deduplication + starvation prevention
 *
 * State lifecycle: detected(RED) → loading(spinner) → success(GREEN) / error(RED warning)
 *   GREEN click → collapse, hide translation, return to RED (cached)
 *   RED click (cached) → restore translation, return to GREEN
 *   RED click (uncached) → immediate translate
 */
const ArticleTranslator = {
  _active: false, _observer: null, _seen: new WeakSet(), _busy: false,
  _pending: [], _blockId: 0, _totalTranslated: 0,
  _watchdogActive: false, _recovering: new WeakSet(),
  _flushTimer: null,

  async start() {
    if (this._active) return;
    this._active = true;
    ParaState.setRetryCallback((el) => this._retryParagraph(el));
    ParaState.setToggleCallbacks({
      onCollapse: (el) => this._collapseParagraph(el),
      onExpand: (el) => this._expandParagraph(el),
      onTranslate: (el) => this._translateImmediate(el)
    });
    await DOMHandler.waitForPageReady();

    console.log('[DTI] === Article Translation v5.1 started (direct-scheduling) ===');

    this._initScan();
    this._startWatchdog();
  },

  stop() {
    this._active = false;
    this._pending = [];
    this._busy = false;
    clearTimeout(this._flushTimer); this._flushTimer = null;
    this._recovering = new WeakSet();

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
    const nodes = root.querySelectorAll(sels);

    const eligible = [];
    for (const el of nodes) {
      if (!Utils.isContentArea(el)) continue;
      const t = el.textContent.trim();
      if (t.length < 20 || t.length > 5000) continue;
      if (!Classifier.isParagraph(t, el)) continue;
      if (this._seen.has(el)) continue;
      this._seen.add(el);
      eligible.push({ element: el, text: t, priority: this._calcPriority(el) });
      ParaState.attach(el, 'detected');
      console.log('[DTI] Paragraph detected: wordCount=', Classifier.englishWordCount(t), 'type=article');
    }
    console.log('[DTI] Initial scan:', eligible.length, 'paragraphs → auto-enqueuing');

    // IntersectionObserver for viewport-triggered lazy content
    this._observer = new IntersectionObserver((entries) => {
      const batch = [];
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        if (this._seen.has(el)) { this._observer.unobserve(el); continue; }
        this._seen.add(el);
        const t = el.textContent.trim();
        if (t.length >= 20 && t.length <= 5000 && Utils.isContentArea(el) && Classifier.isParagraph(t, el)) {
          batch.push({ element: el, text: t, priority: this._PRI_HIGH });
          ParaState.attach(el, 'detected');
          console.log('[DTI] Viewport-triggered paragraph: wordCount=', Classifier.englishWordCount(t));
        }
      }
      if (batch.length) {
        console.log('[DTI] Viewport triggered', batch.length, 'new paragraphs');
        this._enqueue(batch);
      }
    }, { rootMargin: '500px 0px' });

    for (const el of nodes) {
      if (Utils.isContentArea(el) && el.textContent.trim().length >= 20)
        this._observer.observe(el);
    }

    // Auto-translate immediately — direct call, no microtask
    if (eligible.length) this._enqueue(eligible);

    // Safety net: after 1.5s, re-check for any RED paragraphs still stuck
    setTimeout(() => {
      if (!this._active) return;
      let stuckCount = 0;
      for (const [el, entry] of ParaState._map) {
        if (entry.state !== 'detected') continue;
        if (ParaState.hasTranslation(el)) continue;
        if (!el.isConnected) continue;
        const t = el.textContent.trim();
        if (t.length < 20 || t.length > 5000) continue;
        stuckCount++;
        console.log('[DTI] Safety net: force-rescheduling stuck RED paragraph. text=', t.substring(0, 40));
        this._enqueue([{ element: el, text: t, priority: ViewportManager.isVisible(el) ? this._PRI_HIGH : this._PRI_MEDIUM }]);
      }
      if (stuckCount) console.log('[DTI] Safety net recovered', stuckCount, 'stuck paragraphs');
    }, 1500);
  },

  // ── Watchdog ────────────────────────────────────────

  _startWatchdog() {
    if (this._watchdogActive) return;

    TransWatchdog.start({
      onStuck: (stuckElements) => {
        console.log('[DTI] Watchdog recovery triggered: count=', stuckElements.length);
        for (const el of stuckElements) this._recoverParagraph(el);
      },
      onVisibleUntranslated: (visibleElements) => {
        console.log('[DTI] Visible paragraph force-scheduled: priority=high, count=', visibleElements.length);
        const batch = [];
        for (const el of visibleElements) {
          const t = el.textContent.trim();
          if (t.length >= 20 && t.length <= 5000)
            batch.push({ element: el, text: t, priority: this._PRI_HIGH });
        }
        if (batch.length) this._enqueue(batch);
      },
      onQueueFlush: () => {
        if (!this._busy) this._flushPending();
      }
    });

    this._watchdogActive = true;
  },

  // ── Priority Constants ──────────────────────────────

  _PRI_HIGH: 0, _PRI_MEDIUM: 1, _PRI_LOW: 2,

  _calcPriority(el) {
    if (ViewportManager.isVisible(el)) return this._PRI_HIGH;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (rect.top > -vh && rect.top < vh * 3) return this._PRI_MEDIUM;
    return this._PRI_LOW;
  },

  // ── Queue Management (DIRECT scheduling — no microtask) ──

  /**
   * Enqueue batch with deduplication.
   * Triggers flush DIRECTLY when idle — no Promise.resolve() microtask delay.
   */
  _enqueue(batch) {
    let added = 0;
    for (const item of batch) {
      if (this._pending.some(p => p.element === item.element)) continue;
      if (this._recovering.has(item.element)) continue;
      if (ParaState.hasTranslation(item.element)) continue;

      if (item.priority === undefined) item.priority = this._calcPriority(item.element);
      this._pending.push(item);
      added++;
    }

    if (added > 0) {
      console.log('[DTI] Enqueued:', added, 'paragraphs, pending:', this._pending.length);
    }

    // CRITICAL: Directly start processing if idle.
    // No Promise.resolve().then() — that pattern breaks in content scripts.
    if (!this._busy) this._flushPending();
  },

  /**
   * Flush pending queue with viewport-priority ordering.
   * Self-chaining: after batch completes, continues processing remaining items
   * via setTimeout(20ms) to avoid blocking the main thread.
   */
  async _flushPending() {
    if (this._busy || !this._pending.length || !this._active) return;
    this._busy = true;
    clearTimeout(this._flushTimer);

    try {
      while (this._pending.length && this._active) {
        // Sort by priority: visible (0) first, then near (1), then far (2)
        this._pending.sort((a, b) => this._calcPriority(a.element) - this._calcPriority(b.element));

        const batch = this._pending.splice(0, 5);
        const prefs = await Storage.getPreferences();

        const validBatch = [];
        for (const b of batch) {
          const st = ParaState.getState(b.element);
          if (st && st.state === 'success') continue;
          ParaState.transition(b.element, 'loading');
          validBatch.push(b);
        }

        if (!validBatch.length) continue;

        const texts = validBatch.map(b => b.text);
        console.log('[DTI] Translating batch:', validBatch.length, 'paragraphs');

        try {
          const translations = await Translator.translateBatch(texts, prefs.targetLang);
          for (let j = 0; j < validBatch.length; j++) {
            const item = validBatch[j], translation = translations[j];
            if (translation && translation !== item.text && translation.length > 3) {
              this._inject(item.element, translation);
              ParaState.transition(item.element, 'success');
              TransWatchdog.clearRecovery(item.element);
              this._recovering.delete(item.element);
              this._totalTranslated++;
              console.log('[DTI] ✓ Translated:', item.text.substring(0, 50) + '...');
            } else {
              ParaState.transition(item.element, 'error');
              TransWatchdog.clearRecovery(item.element);
              this._recovering.delete(item.element);
              console.warn('[DTI] ✗ Invalid/empty translation for:', item.text.substring(0, 50));
            }
          }
        } catch (e) {
          console.error('[DTI] Batch translation failed:', e.message);
          for (const item of validBatch) {
            ParaState.transition(item.element, 'error');
            TransWatchdog.clearRecovery(item.element);
            this._recovering.delete(item.element);
          }
        }

        // Brief pause between batches to let main thread breathe
        if (this._pending.length) await Utils.sleep(50);
      }
    } finally {
      this._busy = false;
      // Self-chain: continue if more items arrived during processing
      if (this._pending.length && this._active) {
        this._flushTimer = setTimeout(() => this._flushPending(), 20);
      }
      if (this._watchdogActive) TransWatchdog.poke();
    }
  },

  // ── Recovery System ─────────────────────────────────

  async _recoverParagraph(el) {
    if (!this._active) return;
    if (!el.isConnected) { TransWatchdog.clearRecovery(el); return; }

    const t = el.textContent.trim();
    if (t.length < 20 || t.length > 5000) { TransWatchdog.clearRecovery(el); return; }

    if (ParaState.hasTranslation(el)) { TransWatchdog.clearRecovery(el); return; }

    this._recovering.add(el);
    console.log('[DTI] Translation retry triggered: reason=timeout, text=', t.substring(0, 40));

    // Check cache first
    const prefs = await Storage.getPreferences();
    const cached = await TransCache.get(t, prefs.targetLang);
    if (cached && cached.length > 3) {
      this._inject(el, cached);
      ParaState.transition(el, 'success');
      TransWatchdog.clearRecovery(el);
      this._recovering.delete(el);
      console.log('[DTI] Recovery: cache hit');
      return;
    }

    const priority = ViewportManager.isVisible(el) ? this._PRI_HIGH : this._PRI_MEDIUM;
    this._enqueue([{ element: el, text: t, priority }]);
  },

  async _retryParagraph(el) {
    const t = el.textContent.trim(); if (!t) return;
    ParaState.transition(el, 'loading');
    console.log('[DTI] Manual retry:', t.substring(0, 40));
    try {
      const prefs = await Storage.getPreferences();
      const tr = await Translator.translate(t, prefs.targetLang);
      if (tr && tr.length > 3) {
        const old = el.nextElementSibling;
        if (old?.classList?.contains('ds-art-block')) old.remove();
        el.removeAttribute('data-ds-art');
        this._inject(el, tr);
        ParaState.transition(el, 'success');
        TransWatchdog.clearRecovery(el);
      } else { ParaState.transition(el, 'error'); }
    } catch (e) { ParaState.transition(el, 'error'); }
  },

  // ── Rendering ───────────────────────────────────────

  _inject(el, translation) {
    if (el.hasAttribute('data-ds-art')) return;
    const id = 'b' + (++this._blockId);
    el.setAttribute('data-ds-art', id);
    const block = document.createElement('div');
    block.className = 'ds-art-block';
    block.setAttribute('data-ds-art-id', id);
    block.innerHTML =
      '<span class="ds-art-text">' + this._esc(translation) + '</span>' +
      '<span class="ds-art-retry" data-id="' + id + '" title="重译此段">&#x21bb;</span>';
    block.querySelector('.ds-art-retry').onclick = async (e) => {
      e.stopPropagation();
      const te = block.querySelector('.ds-art-text'); te.textContent = '...';
      try {
        const t = await Translator.translate(el.textContent.trim(), (await Storage.getPreferences()).targetLang);
        if (t) te.textContent = t;
      } catch { te.textContent = '重试失败'; }
    };
    el.insertAdjacentElement('afterend', block);
    ParaState.setTranslation(el, translation);
  },

  // ── Toggle Visibility ───────────────────────────────

  _collapseParagraph(el) {
    const block = el.nextElementSibling;
    if (block?.classList?.contains('ds-art-block')) {
      block.classList.add('ds-art-collapsing');
      block.addEventListener('transitionend', () => {
        if (block.classList.contains('ds-art-collapsing')) block.remove();
      }, { once: true });
      setTimeout(() => { if (block.isConnected) block.remove(); }, 300);
    }
    ParaState.transition(el, 'detected');
    console.log('[DTI] Paragraph collapsed: cacheReuse=true');
  },

  _expandParagraph(el) {
    const cached = ParaState.getTranslation(el);
    if (!cached) { this._translateImmediate(el); return; }
    const old = el.nextElementSibling;
    if (old?.classList?.contains('ds-art-block')) old.remove();
    el.removeAttribute('data-ds-art');
    this._inject(el, cached);
    ParaState.transition(el, 'success');
    console.log('[DTI] Paragraph translation restored: fromCache=true');
  },

  async _translateImmediate(el) {
    const t = el.textContent.trim();
    if (!t || t.length < 20) return;
    ParaState.transition(el, 'loading');
    console.log('[DTI] Immediate translation requested');
    try {
      const prefs = await Storage.getPreferences();
      const cached = await TransCache.get(t, prefs.targetLang);
      const tr = cached || await Translator.translate(t, prefs.targetLang);
      if (tr && tr.length > 3) {
        const old = el.nextElementSibling;
        if (old?.classList?.contains('ds-art-block')) old.remove();
        el.removeAttribute('data-ds-art');
        this._inject(el, tr);
        ParaState.transition(el, 'success');
      } else { ParaState.transition(el, 'error'); }
    } catch (e) { ParaState.transition(el, 'error'); }
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
        paraCount++;
      }
    }

    if (paraCount) {
      console.log('[DTI] Dynamic content: paragraphs=', paraCount);
      if (this._watchdogActive) TransWatchdog.poke();
    }
  },

  // ── Helpers ─────────────────────────────────────────

  _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; },

  _getRoot() {
    const h = location.hostname;
    for (const a of [AdapterReddit, AdapterTwitter, AdapterMedium, AdapterArxiv])
      if (a.match(h)) return a.getContentRoot();
    return Readability.findMainContent();
  },

  _getSelectors() {
    const h = location.hostname;
    for (const a of [AdapterReddit, AdapterTwitter, AdapterMedium, AdapterArxiv])
      if (a.match(h)) return a.getSelectors();
    return 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption';
  }
};
