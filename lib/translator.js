/**
 * Translation engine — handles caching + background communication.
 * Queue/batching logic is in TranslationQueue. Display logic is in OverlayManager.
 */
const Translator = {
  async translate(text, targetLang = 'zh-CN') {
    if (!text?.trim()) return '';
    const cached = await Storage.getCachedTranslation(text, targetLang);
    if (cached) return cached;
    const translation = await this._request(text, targetLang);
    if (translation) Storage.setCachedTranslation(text, targetLang, translation).catch(() => {});
    return translation;
  },

  async translateBatch(texts, targetLang = 'zh-CN') {
    if (!texts?.length) return [];
    const results = []; const uncached = []; const idxs = [];
    for (let i = 0; i < texts.length; i++) {
      const c = await Storage.getCachedTranslation(texts[i], targetLang);
      if (c) results[i] = c; else { uncached.push(texts[i]); idxs.push(i); }
    }
    if (!uncached.length) return results;
    const translations = await this._requestBatch(uncached, targetLang);
    for (let i = 0; i < uncached.length; i++) {
      const t = translations[i] || ''; results[idxs[i]] = t;
      if (t) Storage.setCachedTranslation(uncached[i], targetLang, t).catch(() => {});
    }
    return results;
  },

  async _request(text, targetLang) {
    return Utils.retry(async () => {
      const r = await chrome.runtime.sendMessage({ action: 'translate', text, targetLang });
      if (r?.error) throw new Error(r.error);
      return r?.translation || '';
    }, { maxRetries: 2, baseDelay: 500 });
  },

  async _requestBatch(texts, targetLang) {
    return Utils.retry(async () => {
      const r = await chrome.runtime.sendMessage({ action: 'translateBatch', texts, targetLang });
      if (r?.error) throw new Error(r.error);
      return r?.translations || [];
    }, { maxRetries: 2, baseDelay: 500 });
  },

  getSupportedLanguages() {
    return [
      { code: 'zh-CN', name: '中文（简体）' }, { code: 'zh-TW', name: '中文（繁體）' },
      { code: 'en', name: 'English' }, { code: 'ja', name: '日本語' }, { code: 'ko', name: '한국어' },
      { code: 'fr', name: 'Français' }, { code: 'de', name: 'Deutsch' }, { code: 'es', name: 'Español' },
      { code: 'pt', name: 'Português' }, { code: 'ru', name: 'Русский' }, { code: 'ar', name: 'العربية' },
      { code: 'vi', name: 'Tiếng Việt' }, { code: 'th', name: 'ไทย' },
    ];
  }
};
