/**
 * Article Phrase Translator v4 — independent phrase translation mode.
 *
 * Detects short English text (2–10 words) within page content and provides
 * YELLOW square indicators for click-to-translate toggle interaction.
 *
 * Independent mode — controlled by "短语翻译" toggle, NOT coupled to Article mode.
 *
 * State lifecycle (expandable translation):
 *   YELLOW square → detected / collapsed, click to expand (restore cached or translate)
 *   GREEN square  → translation visible, click to collapse
 *   Spinner       → translating
 *   RED square    → translation failure, click to retry
 *
 * Key fixes in v4:
 *   - Stable counter-based IDs (no Map-index shifting)
 *   - Direct block reference stored on entry (no DOM query needed)
 *   - Reliable collapse: immediate display:none + setTimeout removal
 *   - No reliance on CSS transitionend for cleanup
 */
const ArticlePhraseTranslator = {
  _active: false,
  _phraseMap: new Map(), // el → { id, state, indicator, translation, block }
  _seen: new WeakSet(),
  _observer: null,
  _nextId: 0,

  start(root) {
    if (this._active) return;
    this._active = true;
    console.log('[DTI] Phrase Translator started — detecting 2-10 word phrases');
    this._scan(root || Readability.findMainContent());
    this._startObserver(root || Readability.findMainContent());
  },

  stop() {
    this._active = false;
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    this._clearAll();
    this._seen = new WeakSet();
    console.log('[DTI] Phrase Translator stopped');
  },

  // ── Detection ───────────────────────────────────────

  _scan(root) {
    if (!root) return;
    const phraseSelectors = 'p, li, td, th, figcaption, blockquote, dt, dd, label, span, em, strong, h4, h5, h6, .caption, .label, .badge, .tag';
    const nodes = root.querySelectorAll(phraseSelectors);
    let found = 0;

    for (const el of nodes) {
      if (this._seen.has(el)) continue;
      if (!Utils.isContentArea(el)) continue;
      if (ParaState._map.has(el)) continue;
      if (el.hasAttribute('data-ds-art')) continue;
      if (el.closest('[data-ds-art]')) continue;
      if (el.querySelector('p,div,ul,ol,table,blockquote,h1,h2,h3')) continue;
      const text = el.textContent.trim();
      if (text.length < 10 || text.length > 500) continue;
      if (!Classifier.isPhrase(text, el)) continue;

      this._seen.add(el);
      this._attachIndicator(el);
      found++;
    }

    if (found) console.log('[DTI] Phrase detected: count=', found);
  },

  // ── Indicator ───────────────────────────────────────

  _attachIndicator(el) {
    if (this._phraseMap.has(el)) return;
    const id = 'ph' + (++this._nextId);
    const indicator = document.createElement('span');
    indicator.className = 'ds-phrase-indicator phrase-detected';
    indicator.title = '翻译已折叠，点击展开';
    indicator.setAttribute('data-ds-phrase-id', id);
    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._onClick(el);
    });
    el.appendChild(indicator);

    const entry = { id, state: 'detected', indicator, translation: null, block: null, timestamp: Date.now() };
    this._phraseMap.set(el, entry);
    console.log('[DTI] Phrase detected: wordCount=', Classifier.englishWordCount(el.textContent), 'type=phrase');
  },

  // ── Click Handler (shared by all indicator states) ──

  async _onClick(el) {
    const entry = this._phraseMap.get(el);
    if (!entry) return;
    if (entry.state === 'loading') return;

    // GREEN click → collapse translation
    if (entry.state === 'success') {
      this._collapsePhrase(el);
      return;
    }

    // YELLOW click (collapsed) → restore cached or request new
    if (entry.translation && entry.translation.length > 1) {
      this._renderBlock(el, entry.translation);
      this._transition(el, 'success');
      console.log('[DTI] Phrase translation restored: fromCache=true');
      return;
    }

    // RED/error or uncached YELLOW → request translation
    this._transition(el, 'loading');
    const text = el.textContent.trim();
    const prefs = await Storage.getPreferences();

    try {
      let translation = await TransCache.get(text, prefs.targetLang);
      if (!translation) {
        translation = await Translator.translate(text, prefs.targetLang);
        if (translation && translation.length > 1) {
          TransCache.set(text, prefs.targetLang, translation);
        }
      }
      if (translation && translation !== text && translation.length > 1) {
        this._renderBlock(el, translation);
        this._transition(el, 'success');
        entry.translation = translation;
        console.log('[DTI] Phrase translated:', text.substring(0, 40), '→', translation.substring(0, 40));
      } else {
        this._transition(el, 'error');
        console.warn('[DTI] Phrase translation empty/invalid for:', text.substring(0, 40));
      }
    } catch (e) {
      this._transition(el, 'error');
      console.error('[DTI] Phrase translation failed:', e.message);
    }
  },

  // ── Rendering ───────────────────────────────────────

  /**
   * Render (or re-render) the embedded translation block.
   * Removes any old block first, creates fresh one, stores reference on entry.
   */
  _renderBlock(el, translation) {
    this._hideBlock(el); // Remove old block if any

    const entry = this._phraseMap.get(el);
    const block = document.createElement('span');
    block.className = 'ds-phrase-block';
    if (entry) {
      block.setAttribute('data-ds-phrase-id', entry.id);
      entry.block = block; // Direct reference for instant collapse
    }
    block.innerHTML =
      '<span class="ds-phrase-text">' + this._esc(translation) + '</span>' +
      '<span class="ds-phrase-retry" title="重译">&#x21bb;</span>';
    block.querySelector('.ds-phrase-retry').onclick = (e) => {
      e.stopPropagation(); e.preventDefault();
      this._refreshPhrase(el);
    };
    el.insertAdjacentElement('afterend', block);
  },

  /**
   * Collapse: instantly hide the translation block, switch to YELLOW.
   * Uses entry.block for direct reference (no DOM query).
   * Fades out inline via CSS transition, removes after 250ms.
   */
  _collapsePhrase(el) {
    const entry = this._phraseMap.get(el);
    if (entry?.block?.isConnected) {
      entry.block.classList.add('ds-phrase-collapsing');
      // Schedule removal — don't rely on transitionend (unreliable for inline-block)
      const block = entry.block;
      setTimeout(() => { if (block.isConnected) block.remove(); }, 250);
    }
    // Also clean up any orphaned blocks with matching ID
    this._hideBlock(el);
    this._transition(el, 'detected');
    console.log('[DTI] Phrase collapsed: cacheReuse=true, text=', el.textContent?.substring(0, 30));
  },

  /** Remove translation block — uses direct entry reference with DOM fallback */
  _hideBlock(el) {
    const entry = this._phraseMap.get(el);
    // Direct reference (fast path)
    if (entry?.block?.isConnected) {
      entry.block.remove();
      entry.block = null;
    }
    // DOM fallback (cleanup orphaned blocks)
    if (entry?.id) {
      const orphan = document.querySelector(`[data-ds-phrase-id="${entry.id}"]`);
      if (orphan) orphan.remove();
    }
  },

  // ── Refresh ─────────────────────────────────────────

  async _refreshPhrase(el) {
    const entry = this._phraseMap.get(el);
    if (!entry || entry.state === 'loading') return;

    const oldTranslation = entry.translation;
    const text = el.textContent.trim();
    if (!text) return;

    this._hideBlock(el);
    this._transition(el, 'loading');
    console.log('[DTI] Phrase refresh started');

    try {
      const prefs = await Storage.getPreferences();
      TransCache._mem.delete(text.trim() + '|' + prefs.targetLang);
      const translation = await Translator.translate(text, prefs.targetLang);

      if (translation && translation !== text && translation.length > 1) {
        TransCache.set(text, prefs.targetLang, translation);
        entry.translation = translation;
        this._renderBlock(el, translation);
        this._transition(el, 'success');
        console.log('[DTI] Phrase refresh success');
      } else {
        if (oldTranslation && oldTranslation.length > 1) {
          entry.translation = oldTranslation;
          this._renderBlock(el, oldTranslation);
        }
        this._transition(el, oldTranslation ? 'success' : 'error');
        console.warn('[DTI] Phrase refresh: empty translation, restored previous');
      }
    } catch (e) {
      console.error('[DTI] Phrase refresh failed:', e.message);
      if (oldTranslation && oldTranslation.length > 1) {
        entry.translation = oldTranslation;
        this._renderBlock(el, oldTranslation);
        this._transition(el, 'success');
      } else {
        this._transition(el, 'error');
      }
    }
  },

  // ── State Machine ───────────────────────────────────

  _transition(el, state) {
    const entry = this._phraseMap.get(el);
    if (!entry) return;
    entry.state = state;
    entry.timestamp = Date.now();

    const indicator = entry.indicator;
    if (!indicator) return;

    indicator.className = 'ds-phrase-indicator';

    switch (state) {
      case 'detected':
        indicator.className += ' phrase-detected';
        indicator.title = '翻译已折叠，点击展开';
        indicator.style.cursor = 'pointer';
        break;

      case 'loading':
        indicator.className += ' phrase-loading';
        indicator.title = '正在翻译...';
        indicator.style.cursor = '';
        break;

      case 'success':
        indicator.className += ' phrase-success';
        indicator.title = '翻译完成，点击折叠';
        indicator.style.cursor = 'pointer';
        break;

      case 'error':
        indicator.className += ' phrase-error';
        indicator.title = '翻译失败，点击重试';
        indicator.style.cursor = 'pointer';
        break;
    }
  },

  // ── Retry ───────────────────────────────────────────

  async retry(el) {
    const entry = this._phraseMap.get(el);
    if (!entry || entry.state === 'loading') return;
    this._hideBlock(el);
    this._transition(el, 'detected');
    await this._onClick(el);
  },

  // ── Dynamic Content ─────────────────────────────────

  feedNewNodes(nodes) {
    if (!this._active) return;
    let found = 0;
    for (const n of nodes) {
      if (n.nodeType !== 1) continue;
      if (this._isPhraseCandidate(n)) {
        if (!this._seen.has(n)) {
          this._seen.add(n);
          this._attachIndicator(n);
          found++;
        }
      }
      const phraseSelectors = 'p, li, td, th, figcaption, blockquote, dt, dd, label, span, em, strong, h4, h5, h6';
      const descendants = n.querySelectorAll ? n.querySelectorAll(phraseSelectors) : [];
      for (const el of descendants) {
        if (this._seen.has(el)) continue;
        if (this._isPhraseCandidate(el)) {
          this._seen.add(el);
          this._attachIndicator(el);
          found++;
        }
      }
    }
    if (found) console.log('[DTI] Phrase detected from dynamic content: count=', found);
  },

  _isPhraseCandidate(el) {
    if (!Utils.isContentArea(el)) return false;
    if (ParaState._map.has(el)) return false;
    if (el.hasAttribute('data-ds-art')) return false;
    if (el.closest('[data-ds-art]')) return false;
    if (el.querySelector('p,div,ul,ol,table,blockquote,h1,h2,h3')) return false;
    const text = el.textContent.trim();
    if (text.length < 10 || text.length > 500) return false;
    return Classifier.isPhrase(text, el);
  },

  // ── Observer ────────────────────────────────────────

  _startObserver(root) {
    if (!root) return;
    if (this._observer) this._observer.disconnect();
    const phraseSelectors = 'p, li, td, th, figcaption, blockquote, dt, dd, label, span, em, strong, h4, h5, h6';
    this._observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        if (this._seen.has(el)) { this._observer.unobserve(el); continue; }
        if (this._isPhraseCandidate(el)) {
          this._seen.add(el);
          this._attachIndicator(el);
          console.log('[DTI] Phrase detected via viewport: wordCount=', Classifier.englishWordCount(el.textContent));
        }
      }
    }, { rootMargin: '400px 0px' });

    for (const el of root.querySelectorAll(phraseSelectors)) {
      if (this._isPhraseCandidate(el) && !this._seen.has(el)) {
        this._seen.add(el);
        this._attachIndicator(el);
      } else if (!this._seen.has(el) && Utils.isContentArea(el)) {
        this._observer.observe(el);
      }
    }
  },

  // ── Cleanup ─────────────────────────────────────────

  _clearAll() {
    for (const [el, entry] of this._phraseMap) {
      if (entry.indicator) entry.indicator.remove();
      if (entry.block?.isConnected) entry.block.remove();
    }
    this._phraseMap.clear();
    this._nextId = 0;
    document.querySelectorAll('.ds-phrase-block').forEach(b => b.remove());
    document.querySelectorAll('.ds-phrase-indicator').forEach(i => i.remove());
  },

  _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
};
