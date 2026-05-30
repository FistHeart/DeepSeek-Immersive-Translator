/**
 * Phrase Translator — handles DeepSeek API requests with cancellation + timeout.
 *
 * Request lifecycle:
 *   1. translate(text, lang, entryId) → returns translation string
 *   2. Each request tracked by entryId for cancellation support
 *   3. Automatic 12s timeout (background.js has 15s, we cut at 12s for safety)
 *   4. cancel(entryId) aborts in-flight request, rejects with 'Cancelled'
 *   5. cancelAll() cleans up all pending requests (called on module stop)
 *
 * Cancellation pattern: stores a per-entry "active" flag. When cancelled,
 * the flag is cleared; when the response arrives, it checks the flag before
 * resolving. This works around chrome.runtime.sendMessage not supporting
 * native AbortController.
 */
const PhraseTranslator = {
  _pending: new Map(), // entryId → { active: boolean }
  TIMEOUT_MS: 12000,

  /**
   * Translate a phrase with cancellation support.
   *
   * @param {string} text       - Source text to translate
   * @param {string} lang       - Target language code
   * @param {string} entryId    - Unique entry ID for cancellation tracking
   * @returns {Promise<string>} Translated text
   */
  async translate(text, lang, entryId) {
    // Mark as pending
    this._pending.set(entryId, { active: true });

    try {
      const result = await this._withTimeout(
        Translator.translate(text, lang),
        this.TIMEOUT_MS
      );

      // Check if cancelled during flight
      const pending = this._pending.get(entryId);
      if (!pending?.active) {
        throw new Error('Cancelled');
      }

      return result;
    } finally {
      this._pending.delete(entryId);
    }
  },

  /**
   * Cancel an in-flight translation request.
   * The pending promise will reject with 'Cancelled'.
   */
  cancel(entryId) {
    const pending = this._pending.get(entryId);
    if (pending) {
      pending.active = false;
      this._pending.delete(entryId);
      console.log('[DTI] Phrase request cancelled: entryId=', entryId);
    }
  },

  /**
   * Cancel all in-flight translation requests. Called on module stop.
   */
  cancelAll() {
    for (const [entryId] of this._pending) {
      this.cancel(entryId);
    }
    this._pending.clear();
    console.log('[DTI] Phrase all pending requests cancelled');
  },

  /**
   * Check if a translation is currently in-flight for the given entry.
   */
  isPending(entryId) {
    return this._pending.has(entryId);
  },

  // ── Internal ────────────────────────────────────────

  /**
   * Race a promise against a timeout. Rejects with 'Timeout' if exceeded.
   */
  _withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), ms)
      )
    ]);
  }
};
