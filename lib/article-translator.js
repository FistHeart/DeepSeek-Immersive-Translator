/**
 * Article Translator v5 — 正文翻译全自动段落翻译流水线。
 *
 * Key improvements over v4:
 *   - Translation watchdog integration (RED deadlock prevention)
 *   - Viewport-priority scheduling (visible > near > far)
 *   - Auto-recovery: RED > 4s → automatic retry
 *   - Phrase translation sub-system (YELLOW square, click-to-translate)
 *   - Visible content guarantee
 *   - Queue deduplication + starvation prevention
 *
 * State lifecycle: detected(RED) → loading(spinner) → success(GREEN) / error(RED warning)
 */
const ArticleTranslator = {
  _active: false, _observer: null, _seen: new WeakSet(), _busy: false,
  _pending: [], _blockId: 0, _totalTranslated: 0,
  _watchdogActive: false, _phraseActive: false,
  _recovering: new WeakSet(), // elements currently in recovery cycle
  _flushScheduled: false,

  async start() {
    if (this._active) return;
    this._active = true;
    ParaState.setRetryCallback((el) => this._retryParagraph(el));
    // Register toggle callbacks: GREEN→collapse, RED(cached)→expand, RED(uncached)→translate
    ParaState.setToggleCallbacks({
      onCollapse: (el) => this._collapseParagraph(el),
      onExpand: (el) => this._expandParagraph(el),
      onTranslate: (el) => this._translateImmediate(el)
    });
    await DOMHandler.waitForPageReady();

    console.log('[DTI] === Article Translation v5 started ===');
    console.log('[DTI] Features: watchdog, viewport-priority, auto-recovery, phrase-detection');

    this._initScan();
    this._startWatchdog();
    this._startPhraseTranslator();
  },

  stop() {
    this._active = false;
    this._pending = [];
    this._busy = false;
    this._flushScheduled = false;
    this._recovering = new WeakSet();

    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    this._seen = new WeakSet();

    ParaState.setToggleCallbacks({});
    // Stop sub-systems
    if (this._watchdogActive) { TransWatchdog.stop(); this._watchdogActive = false; }
    if (this._phraseActive) { ArticlePhraseTranslator.stop(); this._phraseActive = false; }

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

    // Detect eligible paragraphs + auto-enqueue
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
      console.log('[DTI] Paragraph detected: wordCount=', Classifier.englishWordCount(t), 'type=article, priority=', this._calcPriority(el));
    }
    console.log('[DTI] Initial scan:', eligible.length, 'paragraphs → auto-enqueuing');

    // Observer for lazy content (viewport-triggered)
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

    // Auto-translate immediately
    if (eligible.length) this._enqueue(eligible);
  },

  // ── Watchdog ────────────────────────────────────────

  _startWatchdog() {
    if (this._watchdogActive) return;

    TransWatchdog.start({
      onStuck: (stuckElements) => {
        console.log('[DTI] Watchdog recovery triggered: count=', stuckElements.length);
        for (const el of stuckElements) {
          this._recoverParagraph(el);
        }
      },
      onVisibleUntranslated: (visibleElements) => {
        console.log('[DTI] Visible paragraph force-scheduled: priority=high, count=', visibleElements.length);
        const batch = [];
        for (const el of visibleElements) {
          const t = el.textContent.trim();
          if (t.length >= 20 && t.length <= 5000) {
            batch.push({ element: el, text: t, priority: this._PRI_HIGH });
          }
        }
        if (batch.length) this._enqueue(batch);
      },
      onQueueFlush: () => {
        this._scheduleFlush();
      }
    });

    this._watchdogActive = true;
  },

  // ── Phrase Translator ───────────────────────────────

  _startPhraseTranslator() {
    if (this._phraseActive) return;
    ArticlePhraseTranslator.start(this._getRoot());
    this._phraseActive = true;
  },

  // ── Priority Constants ──────────────────────────────

  _PRI_HIGH: 0,   // Visible in viewport — highest priority
  _PRI_MEDIUM: 1,  // Near viewport
  _PRI_LOW: 2,     // Far from viewport

  /** Calculate scheduling priority based on viewport proximity */
  _calcPriority(el) {
    if (ViewportManager.isVisible(el)) return this._PRI_HIGH;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight;
    // Near viewport: within 2x viewport height
    if (rect.top > -vh && rect.top < vh * 3) return this._PRI_MEDIUM;
    return this._PRI_LOW;
  },

  // ── Queue Management ────────────────────────────────

  /**
   * Enqueue batch with deduplication.
   * If busy, store for later; if idle, schedule flush.
   */
  _enqueue(batch) {
    let added = 0;
    for (const item of batch) {
      // Dedup: skip if already in pending or being recovered
      if (this._pending.some(p => p.element === item.element)) continue;
      if (this._recovering.has(item.element)) continue;
      // Skip if already translated and collapsed (toggle state)
      if (ParaState.hasTranslation(item.element)) continue;

      // Assign priority if not set
      if (item.priority === undefined) item.priority = this._calcPriority(item.element);
      this._pending.push(item);
      added++;
    }

    if (added > 0) {
      console.log('[DTI] Enqueued:', added, 'paragraphs, pending total:', this._pending.length);
    }

    this._scheduleFlush();
  },

  /** Schedule flush — debounced to batch up rapid additions */
  _scheduleFlush() {
    if (this._flushScheduled || this._busy) return;
    this._flushScheduled = true;
    // Use microtask timing — next tick
    Promise.resolve().then(() => {
      this._flushScheduled = false;
      if (!this._busy) this._flushPending();
    });
  },

  /** Flush pending queue with viewport-priority ordering */
  async _flushPending() {
    if (this._busy || !this._pending.length || !this._active) return;
    this._busy = true;

    try {
      while (this._pending.length && this._active) {
        // Sort by priority: visible first, then near, then far
        this._pending.sort((a, b) => {
          // Recalculate priorities (viewport may have changed)
          const pa = this._calcPriority(a.element);
          const pb = this._calcPriority(b.element);
          if (pa !== pb) return pa - pb;
          // Same priority: earlier detections first
          return 0;
        });

        const batch = this._pending.splice(0, 5);
        const prefs = await Storage.getPreferences();

        // Skip already-translated items (race condition guard)
        const validBatch = [];
        for (const b of batch) {
          const st = ParaState.getState(b.element);
          if (st && st.state === 'success') {
            // Already done, skip
            continue;
          }
          // Transition to loading
          ParaState.transition(b.element, 'loading');
          validBatch.push(b);
        }

        if (!validBatch.length) continue;

        const texts = validBatch.map(b => b.text);

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
              const priorityLabel = item.priority === 0 ? 'high' : item.priority === 1 ? 'medium' : 'low';
              console.log('[DTI] ✓ Translated (', priorityLabel, '):', item.text.substring(0, 60) + '...');
            } else {
              ParaState.transition(item.element, 'error');
              TransWatchdog.clearRecovery(item.element);
              this._recovering.delete(item.element);
              console.warn('[DTI] ✗ Invalid translation for:', item.text.substring(0, 60));
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

        // Micro-pause between batches to avoid blocking main thread
        if (this._pending.length) await Utils.sleep(50);
      }
    } finally {
      this._busy = false;
      // Re-check: more items may have arrived during flush
      if (this._pending.length && this._active) this._scheduleFlush();
      // Poke watchdog to re-evaluate after flush completes
      TransWatchdog.poke();
    }
  },

  // ── Recovery System ─────────────────────────────────

  /**
   * Recover a single stuck paragraph.
   * Called by watchdog when RED > 4s.
   */
  async _recoverParagraph(el) {
    if (!this._active) return;
    if (!el.isConnected) {
      TransWatchdog.clearRecovery(el);
      return;
    }

    const t = el.textContent.trim();
    if (t.length < 20 || t.length > 5000) {
      TransWatchdog.clearRecovery(el);
      return;
    }

    // Skip if already has cached translation (collapsed state — user toggled)
    if (ParaState.hasTranslation(el)) {
      TransWatchdog.clearRecovery(el);
      return;
    }

    // Mark as recovering to prevent duplicate recovery attempts
    this._recovering.add(el);
    console.log('[DTI] Translation retry triggered: reason=timeout, text=', t.substring(0, 40));

    // Check cache first — might have been translated by another cycle
    const prefs = await Storage.getPreferences();
    const cached = await TransCache.get(t, prefs.targetLang);
    if (cached && cached.length > 3) {
      this._inject(el, cached);
      ParaState.transition(el, 'success');
      TransWatchdog.clearRecovery(el);
      this._recovering.delete(el);
      console.log('[DTI] Recovery: cache hit for', t.substring(0, 40));
      return;
    }

    // Re-enqueue with high priority (visible if visible, otherwise medium)
    const priority = ViewportManager.isVisible(el) ? this._PRI_HIGH : this._PRI_MEDIUM;
    this._enqueue([{ element: el, text: t, priority }]);
  },

  /** Manual retry (user clicks RED error indicator) */
  async _retryParagraph(el) {
    const t = el.textContent.trim(); if (!t) return;
    ParaState.transition(el, 'loading');
    console.log('[DTI] Manual retry for:', t.substring(0, 40));
    try {
      const prefs = await Storage.getPreferences();
      const tr = await Translator.translate(t, prefs.targetLang);
      if (tr && tr.length > 3) {
        // Remove old translation block
        const old = el.nextElementSibling;
        if (old?.classList?.contains('ds-art-block')) old.remove();
        el.removeAttribute('data-ds-art');
        this._inject(el, tr);
        ParaState.transition(el, 'success');
        TransWatchdog.clearRecovery(el);
        console.log('[DTI] Manual retry success:', t.substring(0, 40));
      } else {
        ParaState.transition(el, 'error');
      }
    } catch (e) {
      ParaState.transition(el, 'error');
      console.error('[DTI] Manual retry failed:', e.message);
    }
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
      const te = block.querySelector('.ds-art-text');
      te.textContent = '...';
      try {
        const t = await Translator.translate(
          el.textContent.trim(),
          (await Storage.getPreferences()).targetLang
        );
        if (t) te.textContent = t;
      } catch { te.textContent = '重试失败'; }
    };
    el.insertAdjacentElement('afterend', block);
    // Cache translation for toggle restore
    ParaState.setTranslation(el, translation);
  },

  // ── Toggle Visibility (collapse / expand) ────────────

  /** Collapse: hide translation block, switch to RED (detected), keep cache */
  _collapseParagraph(el) {
    const block = el.nextElementSibling;
    if (block?.classList?.contains('ds-art-block')) {
      block.classList.add('ds-art-collapsing');
      block.addEventListener('transitionend', () => {
        if (block.classList.contains('ds-art-collapsing')) block.remove();
      }, { once: true });
      // Fallback: remove after transition timeout
      setTimeout(() => { if (block.isConnected) block.remove(); }, 300);
    }
    ParaState.transition(el, 'detected');
    console.log('[DTI] Paragraph collapsed: cacheReuse=true, text=', el.textContent?.substring(0, 40));
  },

  /** Expand: restore cached translation block, switch to GREEN */
  _expandParagraph(el) {
    const cached = ParaState.getTranslation(el);
    if (!cached) {
      // No cache — request translation (shouldn't normally happen)
      this._translateImmediate(el);
      return;
    }
    // Remove old block if exists
    const old = el.nextElementSibling;
    if (old?.classList?.contains('ds-art-block')) old.remove();
    el.removeAttribute('data-ds-art');
    this._inject(el, cached);
    ParaState.transition(el, 'success');
    console.log('[DTI] Paragraph translation restored: fromCache=true, text=', el.textContent?.substring(0, 40));
  },

  /** User clicked RED on untranslated paragraph — immediate translation */
  async _translateImmediate(el) {
    const t = el.textContent.trim();
    if (!t || t.length < 20) return;
    ParaState.transition(el, 'loading');
    console.log('[DTI] Immediate translation requested: text=', t.substring(0, 40));
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
      } else {
        ParaState.transition(el, 'error');
      }
    } catch (e) {
      ParaState.transition(el, 'error');
      console.error('[DTI] Immediate translation failed:', e.message);
    }
  },

  // ── Dynamic Content ─────────────────────────────────

  /**
   * Feed newly loaded DOM nodes (infinite scroll) into the pipeline.
   * Both paragraphs and phrases are detected from new content.
   */
  feedNewNodes(nodes) {
    if (!this._active) return;
    const sels = this._getSelectors();
    let paraCount = 0, phraseCount = 0;

    for (const n of nodes) {
      if (n.nodeType !== 1) continue;

      // Paragraph detection
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

      // Phrase detection delegation
      if (this._phraseActive) {
        const before = ArticlePhraseTranslator._phraseMap.size;
        ArticlePhraseTranslator.feedNewNodes([n]);
        phraseCount += ArticlePhraseTranslator._phraseMap.size - before;
      }
    }

    if (paraCount || phraseCount) {
      console.log('[DTI] Dynamic content: paragraphs=', paraCount, 'phrases=', phraseCount);
    }
    // Poke watchdog after new content
    if (paraCount && this._watchdogActive) {
      TransWatchdog.poke();
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
