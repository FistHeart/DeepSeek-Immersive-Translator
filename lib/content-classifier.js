/**
 * Content Classifier v5 — three-tier classification engine.
 *
 * Rules (English word count):
 *   < 2 words  → 'ignore'     (hover/selection modes only, never auto-embed)
 *   2–10 words → 'phrase'     (YELLOW square, click-to-translate in article mode)
 *   ≥ 10 words → 'paragraph'  (RED→GREEN auto pipeline in article mode)
 *
 * Non-content elements (nav/ads/code/buttons) are always excluded first.
 */
const Classifier = {
  /** Count English/Latin words only — CJK handled separately by Readability */
  englishWordCount(text) {
    if (!text) return 0;
    const s = text.trim();
    const latin = s.match(/[a-zA-ZÀ-ɏ]+/g) || [];
    return latin.length;
  },
  /**
   * Classify text into 'ignore', 'phrase', or 'paragraph'.
   * Classification is based on English word count for the article pipeline.
   */
  classify(text, element) {
    if (!text) return 'ignore';

    // Exclude non-content elements first
    if (element && !Utils.isContentArea(element)) return 'ignore';

    // Skip text that is mostly code/symbols/numbers
    const langChars = text.replace(/[\s\d\W_]/g, '').length;
    if (langChars < 5) return 'ignore';

    // Link density check — portal/nav/list text is mostly links
    // Wikipedia Main Page snippets, navigation, etc. have high link-to-text ratios
    if (element) {
      const links = element.querySelectorAll('a');
      let linkTextLen = 0;
      for (const a of links) linkTextLen += (a.textContent || '').length;
      const linkRatio = linkTextLen / (text.length || 1);

      // >50% link text = navigation/portal/list — skip
      if (linkRatio > 0.5) return 'ignore';

      // Many short links in a small text block = navigation
      if (links.length >= 5 && text.length < 200 && linkRatio > 0.3) return 'ignore';
    }

    const ewc = this.englishWordCount(text);

    // < 2 English words: only hover/selection modes handle these
    if (ewc < 2) return 'ignore';

    // 2–10 English words: phrase content → YELLOW square in article mode
    if (ewc <= 10) return 'phrase';

    // ≥ 10 English words: article paragraph → auto-translate pipeline
    return 'paragraph';
  },

  /** True if text qualifies for auto article embedding (RED→GREEN pipeline) */
  isParagraph(text, element) {
    return this.classify(text, element) === 'paragraph';
  },

  /** True if text qualifies for phrase treatment (YELLOW square, click-to-translate) */
  isPhrase(text, element) {
    return this.classify(text, element) === 'phrase';
  },

  /** True if text should be ignored by article mode completely */
  isIgnored(text, element) {
    return this.classify(text, element) === 'ignore';
  }
};
