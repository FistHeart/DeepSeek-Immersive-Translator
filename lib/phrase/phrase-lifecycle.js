/**
 * Phrase Lifecycle v2 — full-line translation with phrase highlighting.
 *
 * Key behavior change from v1:
 *   When a phrase is detected and user clicks to translate, the ENTIRE
 *   containing block is translated, not just the isolated phrase.
 *   The target phrase is visually highlighted in the rendered translation.
 *
 * States:
 *   COLLAPSED (YELLOW)  — Phrase detected, indicator visible, translation hidden
 *   LOADING   (spinner) — Translation request in-flight
 *   EXPANDED  (GREEN)   — Translation box visible, indicator GREEN
 *   ERROR     (RED)     — Translation failed, retry available
 */
const PhraseLifecycle = {
  _entries: new Map(),

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
      phraseText: el.textContent.trim(),  // the detected phrase
      state: 'detected',
      timestamp: Date.now()
    };

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

  unregister(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry) return;
    PhraseTranslator.cancel(entryId);
    if (entry.indicator?.isConnected) entry.indicator.remove();
    if (entry.block?.isConnected) PhraseRenderer.removeTranslationBoxImmediate(entry.block);
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
  //  EXPAND — full-line translation with highlighting
  // ═══════════════════════════════════════════════════

  async _expand(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry?.element?.isConnected) return;
    if (entry.state === 'loading') return;

    // Fast path: cached
    if (entry.translation && entry.translation.length > 1) {
      this._renderBlock(entry);
      this._transition(entryId, 'success');
      console.log('[DTI] Phrase restored from cache: entryId=' + entryId);
      return;
    }

    // ── Full-line translation ──
    // Instead of translating only the detected phrase, translate the
    // entire containing block for context. The phrase is highlighted.
    const fullText = this._getContainingBlockText(entry.element);
    if (!fullText) return;

    this._transition(entryId, 'loading');

    try {
      const prefs = await Storage.getPreferences();
      const v = TransValidator.validate(fullText, prefs.targetLang, 'phrase');
      if (!v.valid) { this._transition(entryId, 'error'); return; }

      let translation = await PhraseCache.get(fullText, prefs.targetLang);
      if (!translation) {
        translation = await PhraseTranslator.translate(fullText, prefs.targetLang, entryId);
      }

      if (translation && translation !== fullText && translation.length > 1) {
        entry.translation = translation;
        entry.fullText = fullText;
        PhraseCache.set(fullText, prefs.targetLang, translation).catch(() => {});
        this._renderBlock(entry);
        this._transition(entryId, 'success');
        console.log('[DTI] Phrase full-line translation expanded: entryId=' + entryId);
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
  //  COLLAPSE
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
  //  REFRESH
  // ═══════════════════════════════════════════════════

  async refresh(entryId) {
    const entry = this._entries.get(entryId);
    if (!entry?.element?.isConnected) return;
    if (entry.state === 'loading') return;

    const fullText = this._getContainingBlockText(entry.element);
    const oldTranslation = entry.translation;

    if (entry.block?.isConnected) {
      PhraseRenderer.showLoadingInBox(entry.block);
    }

    this._transition(entryId, 'loading');
    console.log('[DTI] Phrase refresh started: entryId=' + entryId);

    try {
      const prefs = await Storage.getPreferences();
      await PhraseCache.invalidate(fullText, prefs.targetLang);
      TransCache._mem.delete(fullText.trim() + '|' + prefs.targetLang);

      const translation = await PhraseTranslator.translate(fullText, prefs.targetLang, entryId);

      if (translation && translation !== fullText && translation.length > 1) {
        entry.translation = translation;
        entry.fullText = fullText;
        PhraseCache.set(fullText, prefs.targetLang, translation).catch(() => {});
        this._renderBlock(entry);
        this._transition(entryId, 'success');
        console.log('[DTI] Phrase refresh success: entryId=' + entryId);
      } else {
        if (oldTranslation && oldTranslation.length > 1) {
          entry.translation = oldTranslation;
          this._renderBlock(entry);
        }
        this._transition(entryId, oldTranslation ? 'success' : 'error');
        console.warn('[DTI] Phrase refresh: empty, restored previous');
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
  //  Rendering — full-line translation with highlight
  // ═══════════════════════════════════════════════════

  _renderBlock(entry) {
    if (entry.block?.isConnected) {
      PhraseRenderer.removeTranslationBoxImmediate(entry.block);
    }
    entry.block = null;
    if (!entry.translation) return;

    // Create translation box with phrase highlighted in the full-line result
    const block = PhraseRenderer.createHighlightedTranslationBox(
      entry.id, entry.translation, entry.phraseText,
      () => this.refresh(entry.id)
    );

    // Safe injection: handle restricted parents
    const parent = entry.element.parentElement;
    const parentTag = parent ? parent.tagName : '';
    if (parentTag === 'UL' || parentTag === 'OL' || parentTag === 'TR' ||
        parentTag === 'TBODY' || parentTag === 'THEAD' || parentTag === 'TFOOT') {
      block.classList.add('ds-ph-block--child');
      entry.element.appendChild(block);
    } else {
      entry.element.insertAdjacentElement('afterend', block);
    }

    entry.block = block;
  },

  // ═══════════════════════════════════════════════════
  //  Helpers
  // ═══════════════════════════════════════════════════

  /**
   * Get the full containing block text for a phrase element.
   * Walks up to find the nearest block-level parent and returns its text.
   * Falls back to the element's own text if no suitable parent found.
   */
  _getContainingBlockText(el) {
    // Try the element itself first
    const ownText = el.textContent.trim();
    if (ownText.length >= 30) return ownText;

    // Look for a block-level parent with more content
    let parent = el.parentElement;
    while (parent && parent !== document.body) {
      const tag = parent.tagName;
      if (tag === 'P' || tag === 'DIV' || tag === 'LI' || tag === 'TD' ||
          tag === 'TH' || tag === 'BLOCKQUOTE' || tag === 'SECTION' ||
          tag === 'ARTICLE' || tag === 'FIGCAPTION') {
        const text = parent.textContent.trim();
        if (text.length >= 30 && text.length <= 2000) return text;
      }
      parent = parent.parentElement;
    }

    return ownText;
  }
};
