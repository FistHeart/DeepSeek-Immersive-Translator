/**
 * Paragraph Indexer — assigns stable IDs to paragraphs for tracking across DOM mutations.
 * Maintains a map of id → {element, text, translated, cached}.
 */
const ParagraphIndex = {
  _map: new Map(),
  _counter: 0,

  /** Register a paragraph element, return its stable ID */
  index(el) {
    for (const [id, entry] of this._map) if (entry.element === el) return id;
    const id = 'p' + (++this._counter);
    this._map.set(id, { element: el, text: el.textContent.trim().substring(0, 3000), translated: false, timestamp: Date.now() });
    return id;
  },

  /** Get entry by ID */
  get(id) { return this._map.get(id); },

  /** Get ID for element */
  getId(el) { for (const [id, e] of this._map) if (e.element === el) return id; return null; },

  /** Mark as translated */
  markTranslated(id) { const e = this._map.get(id); if (e) e.translated = true; },

  /** Check if already indexed */
  has(el) { for (const e of this._map.values()) if (e.element === el) return true; return false; },

  /** Prune entries whose elements are no longer in DOM */
  prune() { for (const [id, e] of this._map) if (!e.element.isConnected) this._map.delete(id); },

  /** Get all entries for pre-translation */
  getAll() { return [...this._map.values()]; },

  clear() { this._map.clear(); this._counter = 0; }
};
