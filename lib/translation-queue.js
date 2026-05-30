/** Background pre-translation queue. Scans & translates before user hovers. */
const TransQueue = {
  _queue: [],
  _busy: false,
  _batch: 5,

  /** Enqueue a paragraph for background translation */
  add(paragraph) {
    if (this._queue.some(q => q.element === paragraph.element)) return;
    this._queue.push(paragraph);
    this._flush();
  },

  addBatch(paragraphs) {
    for (const p of paragraphs) this.add(p);
  },

  async _flush() {
    if (this._busy || !this._queue.length) return;
    this._busy = true;
    while (this._queue.length) {
      const batch = this._queue.splice(0, this._batch);
      const prefs = await Storage.getPreferences();
      const texts = batch.map(b => b.text);
      try {
        const translations = await Translator.translateBatch(texts, prefs.targetLang);
        for (let i = 0; i < batch.length; i++) {
          if (translations[i] && translations[i].length > 3) {
            TransCache.set(batch[i].text, prefs.targetLang, translations[i]);
          }
        }
      } catch (e) { /* background failure is silent */ }
      if (this._queue.length) await Utils.sleep(300);
    }
    this._busy = false;
  },

  clear() { this._queue = []; }
};
