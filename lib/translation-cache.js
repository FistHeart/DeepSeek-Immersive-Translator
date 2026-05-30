/** In-memory translation cache — sub-ms access for hover responsiveness. Backed by chrome.storage for persistence. */
const TransCache = {
  _mem: new Map(), // { "text|lang": translation }
  _max: 2000,

  async get(text, lang) {
    const k = text.trim() + '|' + lang;
    if (this._mem.has(k)) return this._mem.get(k);
    const stored = await Storage.getCachedTranslation(text, lang);
    if (stored) { this._mem.set(k, stored); return stored; }
    return null;
  },

  async set(text, lang, translation) {
    const k = text.trim() + '|' + lang;
    this._mem.set(k, translation);
    if (this._mem.size > this._max) { const first = this._mem.keys().next().value; this._mem.delete(first); }
    Storage.setCachedTranslation(text, lang, translation).catch(() => {});
  },

  clear() { this._mem.clear(); Storage.clearCache(); }
};
