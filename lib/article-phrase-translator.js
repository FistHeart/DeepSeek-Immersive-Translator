/**
 * Article Phrase Translator v2 — phrase-level translation with toggleable visibility.
 *
 * Detects short English text (2–10 words) within article content and provides
 * YELLOW square indicators for click-to-translate toggle interaction.
 *
 * This is PART OF "正文翻译" (Article Translation mode), NOT Hover mode.
 *
 * State lifecycle (toggleable visibility):
 *   YELLOW square → detected / collapsed, click to expand (restore cached or translate)
 *   Spinner       → translating
 *   GREEN square   → translation visible, click to collapse
 *   RED square     → translation failure, click to retry
 */
const ArticlePhraseTranslator = {
  _active: false,
  _phraseMap: new Map(),  // el → { state, indicator, translation }
  _seen: new WeakSet(),
  _observer: null,

  /** Start phrase detection within article content */
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

  /** Scan for phrase-eligible elements in article content */
  _scan(root) {
    if (!root) return;
    // Selectors for elements that could contain short phrases
    const phraseSelectors = 'p, li, td, th, figcaption, blockquote, dt, dd, label, span, em, strong, h4, h5, h6, .caption, .label, .badge, .tag';
    const nodes = root.querySelectorAll(phraseSelectors);
    let found = 0;

    for (const el of nodes) {
      if (this._seen.has(el)) continue;
      if (!Utils.isContentArea(el)) continue;

      // Skip elements already in article paragraph pipeline
      if (ParaState._map.has(el)) continue;
      if (el.hasAttribute('data-ds-art')) continue;
      if (el.closest('[data-ds-art]')) continue;

      // Skip elements with child block elements (they're containers, not phrases)
      if (el.querySelector('p,div,ul,ol,table,blockquote,h1,h2,h3')) continue;

      const text = el.textContent.trim();
      if (text.length < 10 || text.length > 500) continue;

      // Classify: must be a phrase (3-10 English words)
      if (!Classifier.isPhrase(text, el)) continue;

      this._seen.add(el);
      this._attachIndicator(el);
      found++;
    }

    if (found) console.log('[DTI] Phrase detected: count=', found);
  },

  /** Attach YELLOW square indicator to a phrase element */
  _attachIndicator(el) {
    if (this._phraseMap.has(el)) return;
    const indicator = document.createElement('span');
    indicator.className = 'ds-phrase-indicator phrase-detected';
    indicator.title = '可翻译短语，点击翻译';
    indicator.setAttribute('data-ds-phrase', '1');
    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this._onClick(el);
    });
    // Insert indicator as inline element after the phrase
    el.appendChild(indicator);
    this._phraseMap.set(el, { state: 'detected', indicator, translation: null, timestamp: Date.now() });
    console.log('[DTI] Phrase detected: wordCount=', Classifier.englishWordCount(el.textContent), 'type=phrase');
  },

  /** Handle click on YELLOW/GREEN/RED square */
  async _onClick(el) {
    const entry = this._phraseMap.get(el);
    if (!entry) return;
    if (entry.state === 'loading') return;

    // GREEN click → collapse translation
    if (entry.state === 'success') {
      this._collapsePhrase(el);
      return;
    }

    // YELLOW click → restore cached or request new translation
    if (entry.translation && entry.translation.length > 1) {
      this._injectTranslation(el, entry.translation);
      this._transition(el, 'success');
      console.log('[DTI] Phrase translation restored: fromCache=true');
      return;
    }

    // RED/error or uncached YELLOW → request translation
    this._transition(el, 'loading');
    const text = el.textContent.trim();
    const prefs = await Storage.getPreferences();

    try {
      // Check cache first
      let translation = await TransCache.get(text, prefs.targetLang);
      if (!translation) {
        translation = await Translator.translate(text, prefs.targetLang);
        if (translation && translation.length > 1) {
          TransCache.set(text, prefs.targetLang, translation);
        }
      }
      if (translation && translation !== text && translation.length > 1) {
        this._injectTranslation(el, translation);
        this._transition(el, 'success');
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

  /** Inject mini translation block below the phrase element */
  _injectTranslation(el, translation) {
    this._removeTranslation(el);
    const block = document.createElement('span');
    block.className = 'ds-phrase-block';
    block.setAttribute('data-ds-phrase-id', this._getId(el));
    block.innerHTML =
      '<span class="ds-phrase-text">' + this._esc(translation) + '</span>' +
      '<span class="ds-phrase-retry" title="重译">&#x21bb;</span>';
    block.querySelector('.ds-phrase-retry').onclick = (e) => {
      e.stopPropagation(); e.preventDefault();
      this._removeTranslation(el);
      this._transition(el, 'loading');
      this._onClick(el);
    };
    el.insertAdjacentElement('afterend', block);
    const entry = this._phraseMap.get(el);
    if (entry) entry.translation = translation;
  },

  /** Collapse: smooth-hide translation block, return to YELLOW (detected) */
  _collapsePhrase(el) {
    const block = document.querySelector(`[data-ds-phrase-id="${this._getId(el)}"]`);
    if (block) {
      block.classList.add('ds-phrase-collapsing');
      block.addEventListener('transitionend', () => {
        if (block.classList.contains('ds-phrase-collapsing')) block.remove();
      }, { once: true });
      setTimeout(() => { if (block.isConnected) block.remove(); }, 300);
    }
    this._transition(el, 'detected');
    console.log('[DTI] Phrase collapsed: cacheReuse=true, text=', el.textContent?.substring(0, 30));
  },

  _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; },

  /** Transition phrase to new state */
  _transition(el, state) {
    const entry = this._phraseMap.get(el);
    if (!entry) return;
    entry.state = state;
    entry.timestamp = Date.now();

    const indicator = entry.indicator;
    if (!indicator) return;

    // Remove old state classes
    indicator.className = 'ds-phrase-indicator';

    switch (state) {
      case 'detected':
        indicator.className += ' phrase-detected';
        indicator.title = '可翻译短语，点击翻译';
        indicator.style.cursor = 'pointer';
        indicator.onclick = (e) => { e.stopPropagation(); this._onClick(el); };
        // Remove spinner if present
        indicator.innerHTML = '';
        break;

      case 'loading':
        indicator.className += ' phrase-loading';
        indicator.title = '正在翻译...';
        indicator.style.cursor = '';
        indicator.innerHTML = '';
        break;

      case 'success':
        indicator.className += ' phrase-success';
        indicator.title = '翻译完成，点击折叠';
        indicator.style.cursor = 'pointer';
        indicator.onclick = (e) => { e.stopPropagation(); this._onClick(el); };
        indicator.innerHTML = '';
        break;

      case 'error':
        indicator.className += ' phrase-error';
        indicator.title = '翻译失败，点击重试';
        indicator.style.cursor = 'pointer';
        indicator.onclick = (e) => { e.stopPropagation(); this._onClick(el); };
        indicator.innerHTML = '';
        break;
    }
  },

  /** Remove translation block for a phrase */
  _removeTranslation(el) {
    const block = document.querySelector(`[data-ds-phrase-id="${this._getId(el)}"]`);
    if (block) block.remove();
  },

  /** Retry a failed phrase translation */
  async retry(el) {
    this._removeTranslation(el);
    await this._onClick(el);
  },

  /** Feed newly loaded DOM nodes into phrase detection */
  feedNewNodes(nodes) {
    if (!this._active) return;
    let found = 0;
    for (const n of nodes) {
      if (n.nodeType !== 1) continue;
      // Check the node itself
      if (this._isPhraseCandidate(n)) {
        if (!this._seen.has(n)) {
          this._seen.add(n);
          this._attachIndicator(n);
          found++;
        }
      }
      // Check descendants
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

  /** Check if an element is a valid phrase candidate */
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

  /** Start MutationObserver + IntersectionObserver for dynamic content */
  _startObserver(root) {
    if (!root) return;
    // IntersectionObserver for phrase elements
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

  _getId(el) {
    for (const [e, entry] of this._phraseMap) {
      if (e === el) return 'ph_' + [...this._phraseMap.keys()].indexOf(e);
    }
    return 'ph_' + Math.random().toString(36).substring(2, 8);
  },

  _clearAll() {
    for (const [el, entry] of this._phraseMap) {
      if (entry.indicator) entry.indicator.remove();
    }
    this._phraseMap.clear();
    document.querySelectorAll('.ds-phrase-block').forEach(b => b.remove());
    document.querySelectorAll('.ds-phrase-indicator').forEach(i => i.remove());
  }
};
