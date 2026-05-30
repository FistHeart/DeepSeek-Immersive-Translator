/**
 * Phrase Detector — scans DOM for 2–10 word English phrases outside article paragraphs.
 *
 * Detection scope: NON-ARTICLE content only.
 *   - Skips elements inside [data-ds-art] (article translator territory)
 *   - Skips elements tracked by ParaState (article paragraphs)
 *   - Skips navigation, buttons, menus, code, form controls
 *   - Skips single words and 11+ word text blocks
 *
 * Target: short UI phrases, technical terms, isolated text fragments, captions.
 */
const PhraseDetector = {
  /** Element selectors that may contain phrase-level text */
  _selectors: [
    'p', 'li', 'td', 'th', 'figcaption', 'blockquote',
    'dt', 'dd', 'label', 'span', 'em', 'strong',
    'h4', 'h5', 'h6', '.caption', '.label', '.badge', '.tag',
    '.subtitle', '.description', '.summary', '.excerpt',
    '.card-text', '.tile-title', '.meta-text'
  ].join(','),

  /** Tags that indicate a parent is a text block (skip children of these) */
  _blockTags: new Set(['P', 'DIV', 'UL', 'OL', 'TABLE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'PRE', 'ARTICLE', 'SECTION']),

  /** Tags always excluded */
  _excludedTags: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG',
    'NAV', 'FOOTER', 'HEADER', 'CODE', 'PRE', 'BUTTON', 'INPUT',
    'SELECT', 'TEXTAREA', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS']),

  /** Minimum character length for phrase text */
  MIN_LENGTH: 10,
  /** Maximum character length for phrase text */
  MAX_LENGTH: 500,
  /** Minimum English words */
  MIN_WORDS: 2,
  /** Maximum English words */
  MAX_WORDS: 10,

  /**
   * Scan a root element for phrase candidates.
   * Returns array of { element, text } for discovered phrases.
   */
  scan(root, seen) {
    if (!root) return [];
    const results = [];
    const nodes = root.querySelectorAll(this._selectors);

    for (const el of nodes) {
      if (seen.has(el)) continue;
      if (!this._isCandidate(el)) continue;
      seen.add(el);
      results.push({ element: el, text: el.textContent.trim() });
    }

    return results;
  },

  /**
   * Check if a single element is a valid phrase candidate.
   * Called for both initial scan and dynamic content feed.
   */
  isCandidate(el) {
    return this._isCandidate(el);
  },

  // ── Internal ────────────────────────────────────────

  /**
   * Full candidate check. Order matters — cheap checks first.
   */
  _isCandidate(el) {
    if (!el || !el.isConnected) return false;
    if (el.nodeType !== 1) return false;

    // 1. Tag exclusion
    const tag = el.tagName;
    if (this._excludedTags.has(tag)) return false;

    // 2. Article translator territory — MUST NOT overlap
    //    Elements inside article translation blocks are handled by ArticleTranslator
    if (el.hasAttribute('data-ds-art')) return false;
    if (el.closest('[data-ds-art]')) return false;

    // 3. Article paragraph state — ParaState tracks article paragraphs
    if (typeof ParaState !== 'undefined' && ParaState._map && ParaState._map.has(el)) return false;

    // 4. Element has block-level children → likely a container, not a phrase
    if (el.querySelector('p,div,ul,ol,table,blockquote,h1,h2,h3,pre,article,section')) return false;

    // 5. Content area check (excludes nav, ads, sidebars, code, etc.)
    if (!Utils.isContentArea(el)) return false;

    // 6. Text length bounds
    const text = el.textContent.trim();
    if (text.length < this.MIN_LENGTH || text.length > this.MAX_LENGTH) return false;

    // 7. English word count (2–10 words)
    const ewc = Classifier.englishWordCount(text);
    if (ewc < this.MIN_WORDS || ewc > this.MAX_WORDS) return false;

    // 8. Language character check — must have enough meaningful characters
    const langChars = text.replace(/[\s\d\W_]/g, '').length;
    if (langChars < 8) return false;

    // 9. Not mostly code/symbols
    const symbolRatio = (text.match(/[{}\[\]();=<>|&$#@\\/`~^*+%!]/g) || []).length / text.length;
    if (symbolRatio > 0.25) return false;

    // 10. Hidden element check
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;

    return true;
  }
};
