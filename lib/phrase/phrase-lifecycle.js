/**
 * Phrase Lifecycle — state machine orchestrating the full phrase interaction flow.
 *
 * States:
 *   COLLAPSED (YELLOW)  — Phrase detected, indicator visible, translation hidden
 *   LOADING   (spinner) — Translation request in-flight
 *   EXPANDED  (GREEN)   — Translation box visible, indicator GREEN
 *   ERROR     (RED)     — Translation failed, retry available
 *
 * Click flow:
 *   YELLOW click → if cached → instant EXPAND (no API call)
 *                → if uncached → LOADING → API call → EXPANDED or ERROR
 *   GREEN click  → COLLAPSED (hide box, preserve cache)
 *   RED click    → same as YELLOW click (retry)
 *
 * Refresh flow (refresh button in translation box):
 *   → invalidate cache → LOADING → API call → update box text → EXPANDED or restore previous
 *   → timeout recovery: if >10s, show ERROR
 *   → stale request cancellation: if new refresh triggered, cancel old one
 *
 * Translation cache is preserved across collapse/expand cycles.
 * Only refresh/retry invalidates cache.
 */
const PhraseLifecycle = {
  /** Core state storage: entryId → { id, element, indicator, block, translation, state, timestamp } */
  _entries: new Map(),

  /**
   * Register a newly detected phrase element.
   * Creates the YELLOW indicator and binds click handler.
   *
   * @param {HTMLElement} el     - Phrase element
   * @param {string}      entryId - Unique entry ID
   * @returns {object} The created entry
   */
  register(el, entryId) {
    if (this._entries.has(entryId)) return this._entries.get(entryId);

    const indicator = PhraseRenderer.createIndicator(entryId);
    el.appendChild(indicator);

    const entry = {
      id: entryId,
      element: el,
      indicator: indicator,
      block: null,
      translation: null,
      state: 'detected',
      timestamp: Date.now()
    };

    // Bind click on indicator
    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._onClick(entryId);
    });

    this._entries.set(entryId, entry);

    const wc = Classifier.englishWordCount(el.textContent);
    console.log('[DTI] Phrase detected: wordCount=' + wc + ' entryId=' + entryId);

    return entry;
  },

  /**
   * Unregister an entry and remove all its DOM elements.
   */
  unregister(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry) return;

    PhraseTranslator.cancel(entryId);
    if (entry.indicator?.isConnected) entry.indicator.remove();
    if (entry.block?.isConnected) PhraseRenderer.removeTranslationBoxImmediate(entry.block);
    this._entries.delete(entryId);
  },

  /**
   * Get an entry by ID.
   */
  get(entryId) {
    return this._entries.get(entryId) || null;
  },

  /**
   * Check if an element is already tracked.
   */
  has(el) {
    for (const entry of this._entries.values()) {
      if (entry.element === el) return true;
    }
    return false;
  },

  /**
   * Get entry ID by element reference.
   */
  getEntryId(el) {
    for (const [id, entry] of this._entries) {
      if (entry.element === el) return id;
    }
    return null;
  },

  /**
   * Remove all entries and DOM elements. Used on module stop.
   */
  clearAll() {
    PhraseTranslator.cancelAll();
    for (const entry of this._entries.values()) {
      if (entry.indicator?.isConnected) entry.indicator.remove();
      if (entry.block?.isConnected) entry.block.remove();
    }
    this._entries.clear();
    // Also clean up any orphaned DOM
    document.querySelectorAll('.ds-ph-indicator').forEach(i => i.remove());
    document.querySelectorAll('.ds-ph-block').forEach(b => b.remove());
  },

  // ═══════════════════════════════════════════════════
  //  CLICK HANDLER — central dispatch
  // ═══════════════════════════════════════════════════

  async _onClick(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry) return;

    switch (entry.state) {
      case 'detected':
        // YELLOW → expand (cached or new translation)
        await this._expand(entryId);
        break;

      case 'success':
        // GREEN → collapse (preserve cache)
        this._collapse(entryId);
        break;

      case 'error':
        // RED → retry translation
        await this._expand(entryId);
        break;

      case 'loading':
        // Spinner → ignore (already in progress)
        break;
    }
  },

  // ═══════════════════════════════════════════════════
  //  EXPAND — show cached translation or request new
  // ═══════════════════════════════════════════════════

  async _expand(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry?.element?.isConnected) return;
    if (entry.state === 'loading') return;

    // ── Fast path: cached translation available → instant restore ──
    if (entry.translation && entry.translation.length > 1) {
      this._renderBlock(entry);
      this._transition(entryId, 'success');
      console.log('[DTI] Phrase translation restored: fromCache=true entryId=' + entryId);
      return;
    }

    // ── Slow path: request translation ──
    const text = entry.element.textContent.trim();
    if (!text) return;

    this._transition(entryId, 'loading');

    try {
      const prefs = await Storage.getPreferences();
      let translation = await PhraseCache.get(text, prefs.targetLang);

      if (!translation) {
        translation = await PhraseTranslator.translate(text, prefs.targetLang, entryId);
      }

      // Validate translation result
      if (translation && translation !== text && translation.length > 1) {
        // Cache the result
        entry.translation = translation;
        PhraseCache.set(text, prefs.targetLang, translation).catch(() => {});

        // Render translation box
        this._renderBlock(entry);
        this._transition(entryId, 'success');
        console.log('[DTI] Phrase translation expanded: entryId=' + entryId);
      } else {
        this._transition(entryId, 'error');
        console.warn('[DTI] Phrase translation empty/invalid: entryId=' + entryId);
      }
    } catch (e) {
      this._transition(entryId, 'error');
      if (e.message === 'Timeout') {
        console.error('[DTI] Phrase translation timeout: entryId=' + entryId);
      } else if (e.message === 'Cancelled') {
        console.log('[DTI] Phrase request cancelled: entryId=' + entryId);
      } else {
        console.error('[DTI] Phrase translation failed: entryId=' + entryId + ' error=' + e.message);
      }
    }
  },

  // ═══════════════════════════════════════════════════
  //  COLLAPSE — hide translation box, preserve cache
  // ═══════════════════════════════════════════════════

  _collapse(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry) return;

    // Remove translation box (animated)
    if (entry.block?.isConnected) {
      PhraseRenderer.removeTranslationBox(entry.block);
      entry.block = null;
    }

    // Transition to YELLOW — cache remains intact for instant restore
    this._transition(entryId, 'detected');
    console.log('[DTI] Phrase translation collapsed: cacheReuse=true entryId=' + entryId);
  },

  // ═══════════════════════════════════════════════════
  //  REFRESH — retranslate from translation box button
  // ═══════════════════════════════════════════════════

  async refresh(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry?.element?.isConnected) return;
    if (entry.state === 'loading') return;

    const text = entry.element.textContent.trim();
    const oldTranslation = entry.translation;

    // Show loading in existing translation box
    if (entry.block?.isConnected) {
      PhraseRenderer.showLoadingInBox(entry.block);
    }

    this._transition(entryId, 'loading');
    console.log('[DTI] Phrase refresh started: entryId=' + entryId);

    try {
      const prefs = await Storage.getPreferences();

      // Invalidate cache for fresh translation
      await PhraseCache.invalidate(text, prefs.targetLang);
      TransCache._mem.delete(text.trim() + '|' + prefs.targetLang);

      const translation = await PhraseTranslator.translate(text, prefs.targetLang, entryId);

      if (translation && translation !== text && translation.length > 1) {
        entry.translation = translation;
        PhraseCache.set(text, prefs.targetLang, translation).catch(() => {});
        this._renderBlock(entry);
        this._transition(entryId, 'success');
        console.log('[DTI] Phrase refresh success: entryId=' + entryId);
      } else {
        // Restore old translation if available
        if (oldTranslation && oldTranslation.length > 1) {
          entry.translation = oldTranslation;
          this._renderBlock(entry);
        }
        this._transition(entryId, oldTranslation ? 'success' : 'error');
        console.warn('[DTI] Phrase refresh: empty translation, restored previous entryId=' + entryId);
      }
    } catch (e) {
      console.error('[DTI] Phrase refresh failed: entryId=' + entryId + ' error=' + e.message);
      // Restore previous translation on failure
      if (oldTranslation && oldTranslation.length > 1) {
        entry.translation = oldTranslation;
        this._renderBlock(entry);
        this._transition(entryId, 'success');
      } else {
        this._transition(entryId, 'error');
      }
    }
  },

  // ═══════════════════════════════════════════════════
  //  State Machine
  // ═══════════════════════════════════════════════════

  _transition(entryId, state) {
    const entry = this._entries.get(entryId);
    if (!entry) return;

    entry.state = state;
    entry.timestamp = Date.now();

    if (entry.indicator?.isConnected) {
      PhraseRenderer.setState(entry.indicator, state);
    }
  },

  // ═══════════════════════════════════════════════════
  //  Rendering
  // ═══════════════════════════════════════════════════

  /**
   * Render (or re-render) the embedded translation box.
   * Removes old block first, creates fresh one.
   */
  _renderBlock(entry) {
    // Remove old block if present
    if (entry.block?.isConnected) {
      PhraseRenderer.removeTranslationBoxImmediate(entry.block);
    }
    entry.block = null;

    if (!entry.translation) return;

    const block = PhraseRenderer.createTranslationBox(
      entry.id, entry.translation,
      () => this.refresh(entry.id)
    );

    entry.element.insertAdjacentElement('afterend', block);
    entry.block = block;
  }
};
