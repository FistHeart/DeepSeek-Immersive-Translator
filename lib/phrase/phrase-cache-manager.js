/**
 * Phrase Cache Manager — dedicated LRU cache for phrase translations.
 *
 * Two-layer architecture:
 *   L1: In-memory Map (sub-ms access, cleared on module stop)
 *   L2: TransCache (chrome.storage-backed, survives page reloads)
 *
 * Isolated from Article/Hover/Selection cache — separate key namespace (prefixed).
 */
const PhraseCache = {
  _mem: new Map(),  // "text|lang" → translation
  _max: 500,        // Max in-memory entries

  /** Build cache key with phrase-specific prefix for isolation */
  _key(text, lang) {
    return 'ph:' + text.trim().toLowerCase() + '|' + lang;
  },

  /** Get translation — L1 first, then L2, promoting to L1 on hit */
  async get(text, lang) {
    const k = this._key(text, lang);
    if (this._mem.has(k)) return this._mem.get(k);

    const stored = await TransCache.get(text, lang);
    if (stored) { this._mem.set(k, stored); this._prune(); }
    return stored || null;
  },

  /** Store translation in both L1 and L2 */
  async set(text, lang, translation) {
    const k = this._key(text, lang);
    this._mem.set(k, translation);
    this._prune();
    TransCache.set(text, lang, translation).catch(() => {});
  },

  /** Check if L1 has cached entry (synchronous, for fast-path checks) */
  hasSync(text, lang) {
    return this._mem.has(this._key(text, lang));
  },

  /** Invalidate L1+L2 cache entry (used before refresh) */
  async invalidate(text, lang) {
    const k = this._key(text, lang);
    this._mem.delete(k);
    // TransCache invalidation is handled by the refresh caller clearing its key
  },

  /** Clear all in-memory cache (on module stop) */
  clear() {
    this._mem.clear();
  },

  /** LRU pruning — remove oldest entries when over max */
  _prune() {
    if (this._mem.size <= this._max) return;
    const excess = this._mem.size - this._max;
    const keys = this._mem.keys();
    for (let i = 0; i < excess; i++) {
      this._mem.delete(keys.next().value);
    }
  }
};
