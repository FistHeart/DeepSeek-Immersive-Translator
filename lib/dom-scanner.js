/** DOM Scanner — site adapters for intelligent paragraph detection. Matches hostname to adapter. */
const DOMScanner = {
  _seen: new WeakSet(), _observer: null, _cachedAdapter: null,

  _getAdapter() {
    if (this._cachedAdapter) return this._cachedAdapter;
    const h = location.hostname;
    const all = [AdapterReddit, AdapterTwitter, AdapterMedium, AdapterArxiv, AdapterWikipedia, AdapterGeneric];
    for (const a of all) { if (a.match(h)) { this._cachedAdapter = a; break; } }
    return this._cachedAdapter;
  },

  scan() {
    const a = this._getAdapter(), root = a.getContentRoot();
    const result = [];
    for (const el of root.querySelectorAll(a.getSelectors())) {
      if (this._seen.has(el)) continue;
      if (!Utils.isContentArea(el) || !a.filterElement(el)) continue;
      const t = el.textContent.trim(); if (t.length < 20) continue;
      this._seen.add(el);
      result.push({ element: el, text: t.substring(0, 3000), length: t.length });
    }
    return result;
  },

  startWatching(cb) {
    const a = this._getAdapter();
    this._observer = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        const el = e.target, t = el.textContent.trim();
        if (t.length >= 20 && Utils.isContentArea(el) && a.filterElement(el))
          cb({ element: el, text: t.substring(0, 3000), length: t.length });
      }
    }, { rootMargin: '400px 0px' });
    for (const el of a.getContentRoot().querySelectorAll(a.getSelectors()))
      if (Utils.isContentArea(el) && el.textContent.trim().length >= 20 && a.filterElement(el))
        this._observer.observe(el);
  },

  observeNew(nodes) {
    if (!this._observer) return;
    const a = this._getAdapter();
    for (const n of nodes) {
      if (n.nodeType !== 1) continue;
      for (const el of (n.querySelectorAll ? n.querySelectorAll(a.getSelectors()) : []))
        if (!this._seen.has(el) && Utils.isContentArea(el) && el.textContent.trim().length >= 20 && a.filterElement(el))
          { this._seen.add(el); this._observer.observe(el); }
    }
  },

  stop() { if (this._observer) { this._observer.disconnect(); this._observer = null; } }
};
