/**
 * Phrase Detector v2 — scans DOM for 4–10 word English phrases outside articles.
 *
 * Detection scope: NON-ARTICLE content only.
 *   - Skips elements inside [data-ds-art] (article translator territory)
 *   - Skips elements tracked by ParaState (article paragraphs)
 *   - Skips hyperlinked text (<a> wrappers)
 *   - Skips standalone bold/strong/em (typographic emphasis only)
 *   - Skips navigation, buttons, menus, code, form controls
 *
 * Target: meaningful semantic chunks — technical phrases, investment terms,
 * AI terminology, natural language phrase groups.
 */
const PhraseDetector = {
  _selectors: [
    'p', 'li', 'td', 'th', 'figcaption', 'blockquote',
    'dt', 'dd', 'label', 'span', 'h4', 'h5', 'h6',
    '.caption', '.label', '.badge', '.tag',
    '.subtitle', '.description', '.summary', '.excerpt',
    '.card-text', '.tile-title', '.meta-text'
  ].join(','),

  _excludedTags: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG',
    'NAV', 'FOOTER', 'HEADER', 'CODE', 'PRE', 'BUTTON', 'INPUT',
    'SELECT', 'TEXTAREA', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'A']),

  MIN_LENGTH: 15,
  MAX_LENGTH: 600,
  MIN_WORDS: 4,   // v2: raised from 2 → 4 (stronger semantic chunks)
  MAX_WORDS: 10,

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

  isCandidate(el) { return this._isCandidate(el); },

  // ── Internal ────────────────────────────────────────

  _isCandidate(el) {
    if (!el || !el.isConnected) return false;
    if (el.nodeType !== 1) return false;

    // 1. Tag exclusion
    if (this._excludedTags.has(el.tagName)) return false;

    // 2. GLOBAL RULE: skip plugin-generated UI nodes (indicators, blocks, popups)
    if (TransCoord.isPluginNode(el)) return false;

    // 3. GLOBAL RULE: skip content already owned by body-translation
    if (TransCoord.isOwned(el)) return false;

    // 4. Skip hyperlinked content — navigation anchors, menu links, clickable text
    if (el.closest('a')) return false;

    // 5. Article translator territory
    if (el.hasAttribute('data-ds-art')) return false;
    if (el.closest('[data-ds-art]')) return false;

    // 6. Article paragraph state
    if (typeof ParaState !== 'undefined' && ParaState._map && ParaState._map.has(el)) return false;

    // 7. Element has block-level children → container, not a phrase
    if (el.querySelector('p,div,ul,ol,table,blockquote,h1,h2,h3,pre,article,section')) return false;

    // 8. Standalone bold/strong/em — pure typographic emphasis, skip
    //    Only skip if the element IS a bold/strong/em tag with no other content siblings
    const tag = el.tagName;
    if ((tag === 'STRONG' || tag === 'B' || tag === 'EM' || tag === 'I') &&
        el.children.length === 0) {
      return false;
    }

    // 9. Content area check
    if (!Utils.isContentArea(el)) return false;

    // 10. Text length bounds
    const text = el.textContent.trim();
    if (text.length < this.MIN_LENGTH || text.length > this.MAX_LENGTH) return false;

    // 11. English word count (4–10 words)
    const ewc = Classifier.englishWordCount(text);
    if (ewc < this.MIN_WORDS || ewc > this.MAX_WORDS) return false;

    // 12. Language character check
    const langChars = text.replace(/[\s\d\W_]/g, '').length;
    if (langChars < 12) return false;

    // 13. Not mostly code/symbols
    const symbolRatio = (text.match(/[{}\[\]();=<>|&$#@\\/`~^*+%!]/g) || []).length / text.length;
    if (symbolRatio > 0.25) return false;

    // 14. Hidden element check
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;

    return true;
  }
};
