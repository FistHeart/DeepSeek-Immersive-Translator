/**
 * Phrase Lifecycle v3 — per-phrase isolated translation with auto-expand.
 *
 * Each phrase element is an INDEPENDENT translation unit:
 *   extract OWN text → translate OWN text → render OWN block.
 * No shared buffers, no parent-block text aggregation, no cross-pollution.
 *
 * Auto-expand: phrases translate immediately on detection (no click required).
 * GREEN click → collapse, YELLOW click → expand from cache, RED click → retry.
 *
 * States: detected(YELLOW) → loading(spinner) → success(GREEN) / error(RED)
 */
const PhraseLifecycle = {
  /** entryId → { id, element, indicator, block, translation, state, timestamp } */
  _entries: new Map(),
  /** Dedup set: prevents same element from being registered twice */
  _elementSet: new WeakSet(),

  /**
   * Register a phrase element and auto-trigger translation.
   * Called by PhraseModule when a new phrase is detected.
   */
  register(el, entryId) {
    if (this._entries.has(entryId)) return this._entries.get(entryId);
    if (this._elementSet.has(el)) return null;
    this._elementSet.add(el);

    const indicator = PhraseRenderer.createIndicator(entryId);
    el.appendChild(indicator);

    const phraseText = el.textContent.trim();

    const entry = {
      id: entryId,
      element: el,
      indicator: indicator,
      block: null,
      translation: null,
      phraseText: phraseText,
      state: 'detected',
      timestamp: Date.now()
    };

    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._onClick(entryId);
    });

    this._entries.set(entryId, entry);

    const wc = Classifier.englishWordCount(phraseText);
    console.log('[DTI] Phrase detected: wordCount=' + wc + ' entryId=' + entryId + ' text=' + phraseText.substring(0, 50));

    // Auto-expand: translate immediately on detection
    this._expand(entryId);

    return entry;
  },

  unregister(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry) return;
    PhraseTranslator.cancel(entryId);
    if (entry.indicator?.isConnected) entry.indicator.remove();
    if (entry.block?.isConnected) PhraseRenderer.removeTranslationBoxImmediate(entry.block);
    this._elementSet.delete(entry.element);
    this._entries.delete(entryId);
  },

  get(entryId) { return this._entries.get(entryId) || null; },

  has(el) {
    for (const entry of this._entries.values()) {
      if (entry.element === el) return true;
    }
    return false;
  },

  getEntryId(el) {
    for (const [id, entry] of this._entries) {
      if (entry.element === el) return id;
    }
    return null;
  },

  clearAll() {
    PhraseTranslator.cancelAll();
    for (const entry of this._entries.values()) {
      if (entry.indicator?.isConnected) entry.indicator.remove();
      if (entry.block?.isConnected) entry.block.remove();
    }
    this._entries.clear();
    this._elementSet = new WeakSet();
    document.querySelectorAll('.ds-ph-indicator').forEach(i => i.remove());
    document.querySelectorAll('.ds-ph-block').forEach(b => b.remove());
  },

  // ═══════════════════════════════════════════════════
  //  CLICK HANDLER
  // ═══════════════════════════════════════════════════

  async _onClick(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry) return;
    switch (entry.state) {
      case 'detected':  await this._expand(entryId); break;
      case 'success':   this._collapse(entryId); break;
      case 'error':     await this._expand(entryId); break;
    }
  },

  // ═══════════════════════════════════════════════════
  //  EXPAND — translate ONLY this phrase's own text
  // ═══════════════════════════════════════════════════
  //
  //  CRITICAL: Only entry.phraseText is translated.
  //  NEVER walks up to parent blocks. Each phrase is isolated.

  async _expand(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry?.element?.isConnected) return;
    if (entry.state === 'loading') return;

    // Fast path: cached translation → instant render
    if (entry.translation && entry.translation.length > 1) {
      this._renderBlock(entry);
      this._transition(entryId, 'success');
      console.log('[DTI] Phrase restored from cache: entryId=' + entryId);
      return;
    }

    // Use ONLY this element's own text — never parent block text
    const text = entry.phraseText;
    if (!text) return;

    this._transition(entryId, 'loading');

    try {
      const prefs = await Storage.getPreferences();
      const v = TransValidator.validate(text, prefs.targetLang, 'phrase');
      if (!v.valid) { this._transition(entryId, 'error'); return; }

      let translation = await PhraseCache.get(text, prefs.targetLang);
      if (!translation) {
        translation = await PhraseTranslator.translate(text, prefs.targetLang, entryId);
      }

      if (translation && translation !== text && translation.length > 1) {
        entry.translation = translation;
        PhraseCache.set(text, prefs.targetLang, translation).catch(() => {});
        this._renderBlock(entry);
        this._transition(entryId, 'success');
        console.log('[DTI] Phrase translated: entryId=' + entryId + ' text=' + text.substring(0, 40) + ' → ' + translation.substring(0, 40));
      } else {
        this._transition(entryId, 'error');
        console.warn('[DTI] Phrase translation empty: entryId=' + entryId);
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
  //  COLLAPSE — hide translation, preserve cache
  // ═══════════════════════════════════════════════════

  _collapse(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry) return;
    if (entry.block?.isConnected) {
      PhraseRenderer.removeTranslationBox(entry.block);
      entry.block = null;
    }
    this._transition(entryId, 'detected');
    console.log('[DTI] Phrase collapsed: cacheReuse=true entryId=' + entryId);
  },

  // ═══════════════════════════════════════════════════
  //  REFRESH — re-translate this phrase
  // ═══════════════════════════════════════════════════

  async refresh(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry?.element?.isConnected) return;
    if (entry.state === 'loading') return;

    const text = entry.phraseText;
    const oldTranslation = entry.translation;

    if (entry.block?.isConnected) {
      PhraseRenderer.showLoadingInBox(entry.block);
    }

    this._transition(entryId, 'loading');
    console.log('[DTI] Phrase refresh started: entryId=' + entryId);

    try {
      const prefs = await Storage.getPreferences();
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
        if (oldTranslation && oldTranslation.length > 1) {
          entry.translation = oldTranslation;
          this._renderBlock(entry);
        }
        this._transition(entryId, oldTranslation ? 'success' : 'error');
      }
    } catch (e) {
      console.error('[DTI] Phrase refresh failed: entryId=' + entryId + ' error=' + e.message);
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
  //  Rendering — isolated per-phrase block
  // ═══════════════════════════════════════════════════

  _renderBlock(entry) {
    // Remove old block if present
    if (entry.block?.isConnected) {
      PhraseRenderer.removeTranslationBoxImmediate(entry.block);
    }
    entry.block = null;
    if (!entry.translation) return;

    // Create isolated translation box — ONLY this phrase's translation
    const block = PhraseRenderer.createTranslationBox(
      entry.id, entry.translation,
      () => this.refresh(entry.id)
    );

    // Safe injection: handle restricted parents (UL, OL, TR, etc.)
    const parent = entry.element.parentElement;
    const parentTag = parent ? parent.tagName : '';
    if (parentTag === 'UL' || parentTag === 'OL' || parentTag === 'TR' ||
        parentTag === 'TBODY' || parentTag === 'THEAD' || parentTag === 'TFOOT') {
      block.classList.add('ds-ph-block--child');
      entry.element.appendChild(block);
    } else {
      entry.element.insertAdjacentElement('afterend', block);
    }

    // Register ownership + mark block as plugin UI (never re-scanned)
    TransCoord.register(entry.element, 'phrase-translation');
    TransCoord.registerBlock(block, 'phrase-translation');

    entry.block = block;
  }
};
