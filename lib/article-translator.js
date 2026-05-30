/**
 * Article Translator v5.3 — shared lifecycle architecture.
 *
 * Single translation entry point: _startLifecycle(el, source)
 *   - 'auto'  → auto-trigger on RED indicator insert, micro-batched via 60ms timer
 *   - 'manual'→ RED click handler, flushes immediately
 *   - 'retry' → error recovery, watchdog, safety net
 *
 * This eliminates the old parallel queue system. Every translation trigger
 * (auto-detect, RED click, retry, recovery) flows through the SAME lifecycle.
 *
 * State lifecycle: detected(RED) → loading(spinner) → success(GREEN) / error(RED warning)
 *   GREEN click → collapse, hide translation, return to RED (cached)
 *   RED click (cached) → restore translation, return to GREEN
 *   RED click (uncached) → _startLifecycle(el, 'manual')
 */
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
    ParaState.setRetryCallback((el) => this._startLifecycle(el, 'retry'));
    ParaState.setToggleCallbacks({
      onCollapse: (el) => this._collapseParagraph(el),
      onExpand: (el) => this._expandParagraph(el),
      onTranslate: (el) => this._startLifecycle(el, 'manual')
    });
    await DOMHandler.waitForPageReady();

    console.log('[DTI] === Article Translation v5.3 started (shared-lifecycle) ===');

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
    document.querySelectorAll('.ds-art-block').forEach(e => e.remove());
    document.querySelectorAll('[data-ds-art]').forEach(e => e.removeAttribute('data-ds-art'));

    console.log('[DTI] Article Translation stopped — total translated:', this._totalTranslated);
    this._totalTranslated = 0;
  },

  // ── Initialization ──────────────────────────────────

  _initScan() {
    const root = this._getRoot(), sels = this._getSelectors();
    const nodes = root.querySelectorAll(sels);

    let detected = 0;
    for (const el of nodes) {
      if (!Utils.isContentArea(el)) continue;
      const t = el.textContent.trim();
      if (t.length < 20 || t.length > 5000) continue;
      if (!Classifier.isParagraph(t, el)) continue;
      if (this._seen.has(el)) continue;
      this._seen.add(el);

      // Insert RED indicator
      ParaState.attach(el, 'detected');
      console.log('[DTI] Paragraph detected: wordCount=', Classifier.englishWordCount(t), 'type=article');

      // AUTO-TRIGGER: immediately start translation lifecycle
      // Same code path as RED click — no separate queue needed
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
          console.log('[DTI] Viewport-triggered paragraph: wordCount=', Classifier.englishWordCount(t));
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
        for (const el of stuckElements) this._startLifecycle(el, 'retry');
      },
      onVisibleUntranslated: (visibleElements) => {
        console.log('[DTI] Visible paragraph force-scheduled: count=', visibleElements.length);
        for (const el of visibleElements) this._startLifecycle(el, 'auto');
      },
      onQueueFlush: () => {
        // Trigger batch flush if items are waiting
        if (this._lifecycleBatch.length) this._flushLifecycle();
      }
    });

    this._watchdogActive = true;
  },

  // ── SHARED TRANSLATION LIFECYCLE ─────────────────────
  //
  //  This is the SINGLE translation entry point.
  //  Every trigger path flows through here:
  //
  //    RED click    → _startLifecycle(el, 'manual')
  //    Auto-detect  → _startLifecycle(el, 'auto')
  //    Retry/Recover→ _startLifecycle(el, 'retry')
  //    Watchdog     → _startLifecycle(el, 'retry')
  //    Safety net   → _startLifecycle(el, 'auto')
  //
  //  'auto' source: collects into _lifecycleBatch, flushes after 60ms window.
  //                 Multiple rapid detects batch into ONE API call.
  //  'manual' source: collects into batch then flushes IMMEDIATELY for
  //                   instant user feedback.
  //  'retry' source: same as 'manual' — immediate flush.
  //

  /**
   * Start translation lifecycle for a single paragraph element.
   * Guards against double-trigger, bad state, and disconnected elements.
   *
   * @param {Element} el — paragraph DOM element
   * @param {string} source — 'auto' | 'manual' | 'retry'
   */
  _startLifecycle(el, source) {
    if (!this._active) return;
    if (!el.isConnected) return;

    const t = el.textContent.trim();
    if (t.length < 20 || t.length > 5000) return;

    // Prevent double auto-trigger (manual clicks can always override)
    if (source === 'auto') {
      if (this._triggered.has(el)) return;
      this._triggered.add(el);
    }

    // Skip if already translated and collapsed (has cached translation)
    if (ParaState.hasTranslation(el)) return;

    // Skip if already in loading or success state
    const st = ParaState.getState(el);
    if (st && (st.state === 'loading' || st.state === 'success')) return;

    // Add to lifecycle batch
    if (!this._lifecycleBatch.some(b => b.element === el)) {
      this._lifecycleBatch.push({ element: el, text: t, source });
    }

    if (source === 'auto') {
      // Batch strategy: wait 60ms to collect adjacent auto-triggers
      // Multiple paragraphs detected together → single batch API call
      clearTimeout(this._lifecycleTimer);
      this._lifecycleTimer = setTimeout(() => this._flushLifecycle(), 60);
    } else {
      // Manual/retry: flush immediately for instant user feedback
      clearTimeout(this._lifecycleTimer);
      this._flushLifecycle();
    }
  },

  /**
   * Flush the lifecycle batch — translates all accumulated paragraphs.
   * Uses Translator.translateBatch for efficient API usage.
   */
  async _flushLifecycle() {
    if (!this._lifecycleBatch.length || !this._active) return;
    const batch = this._lifecycleBatch.splice(0);
    if (!batch.length) return;

    console.log('[DTI] Flushing lifecycle batch:', batch.length, 'paragraphs. sources:', batch.map(b => b.source).join(','));

    // Transition all to loading
    for (const item of batch) {
      ParaState.transition(item.element, 'loading');
    }

    const prefs = await Storage.getPreferences();
    const texts = batch.map(b => b.text);

    try {
      const translations = await Translator.translateBatch(texts, prefs.targetLang);
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i], translation = translations[i];
        if (translation && translation !== item.text && translation.length > 3) {
          this._inject(item.element, translation);
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
        ParaState.transition(item.element, 'error');
      }
    }

    // Poke watchdog after batch completes
    if (this._watchdogActive) TransWatchdog.poke();
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
    if (!cached) { this._startLifecycle(el, 'manual'); return; }
    const old = el.nextElementSibling;
    if (old?.classList?.contains('ds-art-block')) old.remove();
    el.removeAttribute('data-ds-art');
    this._inject(el, cached);
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
        // Auto-trigger translation for newly loaded content
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
