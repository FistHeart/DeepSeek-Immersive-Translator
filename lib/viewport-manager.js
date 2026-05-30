/** Tracks which paragraphs are visible. Hides hover popups when original content leaves viewport. */
const ViewportManager = {
  _observer: null,
  _visible: new Set(),   // elements currently in viewport
  _callbacks: [],

  start() {
    this._observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const el = e.target;
        if (e.isIntersecting) this._visible.add(el);
        else {
          this._visible.delete(el);
          // Notify that element left viewport
          for (const cb of this._callbacks) cb(el, false);
        }
      }
    }, { threshold: 0.1 });
  },

  observe(el) { if (this._observer) this._observer.observe(el); },
  unobserve(el) { if (this._observer) this._observer.unobserve(el); },
  isVisible(el) { return this._visible.has(el); },
  onExit(cb) { this._callbacks.push(cb); },

  stop() {
    if (this._observer) { this._observer.disconnect(); this._observer = null; }
    this._visible.clear();
    this._callbacks = [];
  }
};
