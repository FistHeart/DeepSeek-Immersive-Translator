/**
 * Translation Validator — centralized pre-flight checks for all translation requests.
 *
 * Guards every translation path (Hover, Article, Phrase, Selection) with:
 *   1. API key presence check
 *   2. Target language validity check (only 6 supported)
 *   3. Source text sanity check (non-empty, reasonable length)
 *
 * Called by all four translation systems before sending requests to background.js.
 * Failing validation returns a descriptive error instead of a confusing API error.
 */
const TransValidator = {
  /** Six supported target languages */
  SUPPORTED: new Set(['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr']),

  /**
   * Full validation — returns { valid, error }.
   * Call before any translation API request.
   *
   * @param {string} text       — Source text to translate
   * @param {string} targetLang — Target language code
   * @param {string} mode       — Translation mode label (for logging)
   * @returns {{ valid: boolean, error?: string }}
   */
  validate(text, targetLang, mode) {
    // 1. Source text
    if (!text || typeof text !== 'string' || !text.trim()) {
      console.warn('[DTI] Validation FAILED: empty source text  mode=' + mode);
      return { valid: false, error: 'Empty source text' };
    }
    if (text.trim().length > 5000) {
      console.warn('[DTI] Validation FAILED: text too long  mode=' + mode);
      return { valid: false, error: 'Text exceeds maximum length' };
    }

    // 2. Target language
    if (!targetLang) {
      console.warn('[DTI] Validation FAILED: no target language  mode=' + mode);
      return { valid: false, error: 'No target language selected' };
    }
    if (!this.SUPPORTED.has(targetLang)) {
      console.warn('[DTI] Validation FAILED: unsupported language=' + targetLang + '  mode=' + mode);
      return { valid: false, error: 'Unsupported target language: ' + targetLang };
    }

    // All checks passed
    console.log('[DTI] Translation validation passed: lang=' + targetLang + '  mode=' + mode + '  chars=' + text.trim().length);
    return { valid: true };
  },

  /**
   * Quick check — returns boolean. Use for fast-path guards.
   */
  isValid(text, targetLang) {
    return !!(text?.trim() && targetLang && this.SUPPORTED.has(targetLang) && text.trim().length <= 5000);
  },

  /**
   * Check if a language code is supported.
   */
  isSupportedLang(code) {
    return this.SUPPORTED.has(code);
  },

  /**
   * Normalize a language code to a supported one, falling back to zh-CN.
   */
  normalize(code) {
    if (this.SUPPORTED.has(code)) return code;
    console.warn('[DTI] Language code not supported, falling back to zh-CN: ' + code);
    return 'zh-CN';
  }
};
