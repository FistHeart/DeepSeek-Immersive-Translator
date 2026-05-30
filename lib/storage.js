/**
 * Secure storage layer using chrome.storage.local.
 *
 * Stores:
 *   - apiKey: DeepSeek API key (user-provided, never hardcoded)
 *   - preferences: translation settings
 *   - cache: translation cache for performance
 *
 * Security: All data stays local to the user's browser profile.
 * The API key is NEVER transmitted except to api.deepseek.com via background.js.
 */

const Storage = {
  // ── API Key ──────────────────────────────────────

  async getApiKey() {
    try {
      const result = await chrome.storage.local.get('apiKey');
      return result.apiKey || null;
    } catch (err) {
      console.error('Storage: Failed to read API key', err);
      return null;
    }
  },

  async setApiKey(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('Invalid API key');
    }
    // Strip whitespace
    const cleaned = key.trim();
    if (cleaned.length < 10) {
      throw new Error('API key appears too short');
    }
    await chrome.storage.local.set({ apiKey: cleaned });
  },

  async clearApiKey() {
    await chrome.storage.local.remove('apiKey');
  },

  // ── Preferences ──────────────────────────────────

  async getPreferences() {
    const defaults = {
      enabled: false,
      hoverEnabled: false,
      articleEnabled: false,
      selectionEnabled: false,
      phraseEnabled: false,
      targetLang: 'zh-CN',
      cacheTTL: 86400000,
    };
    try {
      const result = await chrome.storage.local.get('preferences');
      return { ...defaults, ...(result.preferences || {}) };
    } catch (err) {
      return defaults;
    }
  },

  async setPreferences(prefs) {
    const current = await this.getPreferences();
    const merged = { ...current, ...prefs };
    await chrome.storage.local.set({ preferences: merged });
    return merged;
  },

  // ── Translation Cache ────────────────────────────

  async getCachedTranslation(text, targetLang) {
    try {
      const result = await chrome.storage.local.get('translationCache');
      const cache = result.translationCache || {};
      const cacheKey = this._hashKey(text, targetLang);
      const entry = cache[cacheKey];
      if (!entry) return null;

      const prefs = await this.getPreferences();
      // Check TTL
      if (Date.now() - entry.timestamp > prefs.cacheTTL) {
        delete cache[cacheKey];
        await chrome.storage.local.set({ translationCache: cache });
        return null;
      }
      return entry.translation;
    } catch (err) {
      return null;
    }
  },

  async setCachedTranslation(text, targetLang, translation) {
    try {
      const result = await chrome.storage.local.get('translationCache');
      const cache = result.translationCache || {};
      const cacheKey = this._hashKey(text, targetLang);
      cache[cacheKey] = {
        translation,
        timestamp: Date.now(),
        textLength: text.length,
      };

      // Prune cache if too large (keep under ~500 entries)
      const keys = Object.keys(cache);
      if (keys.length > 500) {
        // Remove oldest entries
        const sorted = keys.sort(
          (a, b) => cache[a].timestamp - cache[b].timestamp
        );
        for (const k of sorted.slice(0, keys.length - 500)) {
          delete cache[k];
        }
      }

      await chrome.storage.local.set({ translationCache: cache });
    } catch (err) {
      // Cache failures are non-critical
    }
  },

  async clearCache() {
    await chrome.storage.local.remove('translationCache');
  },

  // ── Helpers ──────────────────────────────────────

  _hashKey(text, targetLang) {
    // Simple hash for cache key generation
    let hash = 0;
    const str = text.trim() + '|' + targetLang;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  },
};
