/**
 * Paragraph State Manager v6 — visual translation status + toggleable visibility + timestamp tracking.
 *
 * Each detected paragraph gets a small status indicator:
 *   'detected'  → RED circle     (translation hidden / collapsed / waiting)
 *   'loading'   → spinner        (translating)
 *   'success'   → GREEN circle   (translation visible — click to collapse)
 *   'error'     → RED warning    (failed, retry available)
 *
 * Indicators now represent BOTH translation state AND visibility toggle:
 *   - GREEN circle: translation is visible, click to collapse
 *   - RED circle:   translation is hidden, click to restore cached OR request new
 *
 * Stores cached translation text so collapsed paragraphs can be instantly restored
 * without re-requesting the API.
 */
const ParaState = {
  _map: new Map(), // el → { state, indicator, timestamp, translation }

  /** Attach status indicator to a paragraph element. Preserves cached translation if re-attaching. */
  attach(el, state) {
    const prev = this._map.get(el);
    const cachedTranslation = prev?.translation || null;
    this.detach(el);
    const dot = document.createElement('span');
    dot.className = 'ds-status ' + state;
    const hasCache = !!cachedTranslation;
    dot.title = this._tooltip(state, hasCache);
    this._bindClick(el, dot, state);
    el.appendChild(dot);
    this._map.set(el, { state, indicator: dot, timestamp: Date.now(), translation: cachedTranslation });
  },

  /**
   * Transition paragraph to new state.
   * Preserves cached translation across state changes.
   */
  transition(el, state) {
    const existing = this._map.get(el);
    if (existing && existing.indicator) {
      existing.indicator.className = 'ds-status ' + state;
      const hasCache = !!existing.translation;
      existing.indicator.title = this._tooltip(state, hasCache);
      existing.state = state;
      existing.timestamp = Date.now();
      this._bindClick(el, existing.indicator, state);
    } else {
      this.attach(el, state);
    }
  },

  /** Remove indicator and tracking */
  detach(el) {
    const e = this._map.get(el);
    if (e?.indicator) e.indicator.remove();
    this._map.delete(el);
  },

  /** Get full state entry */
  getState(el) {
    return this._map.get(el) || null;
  },

  /** Store cached translation for collapsed restore */
  setTranslation(el, text) {
    const entry = this._map.get(el);
    if (entry) entry.translation = text;
  },

  /** Get cached translation, if any */
  getTranslation(el) {
    const entry = this._map.get(el);
    return entry?.translation || null;
  },

  /** Check if element has cached translation (collapsed state) */
  hasTranslation(el) {
    const entry = this._map.get(el);
    return !!(entry && entry.translation);
  },

  /** Set callbacks for toggle interaction */
  setToggleCallbacks(callbacks) {
    this._onCollapse = callbacks.onCollapse;   // (el) => void — hide translation block
    this._onExpand = callbacks.onExpand;       // (el) => void — restore cached translation
    this._onTranslate = callbacks.onTranslate; // (el) => void — request new translation
  },

  /** Set the retry callback for error indicators */
  setRetryCallback(cb) { this._retryCallback = cb; },

  /** Clean up all indicators */
  clearAll() {
    for (const [el, e] of this._map) if (e.indicator) e.indicator.remove();
    this._map.clear();
    this._onCollapse = null;
    this._onExpand = null;
    this._onTranslate = null;
  },

  // ── Internal ────────────────────────────────────────

  _tooltip(state, hasCache) {
    switch (state) {
      case 'detected': return hasCache ? '翻译已折叠，点击展开' : '已检测，自动排队中';
      case 'loading':  return '正在自动翻译...';
      case 'success':  return '翻译完成，点击折叠';
      case 'error':    return '翻译失败，点击重试';
      default:         return '';
    }
  },

  _bindClick(el, dot, state) {
    dot.style.cursor = (state === 'loading') ? '' : 'pointer';
    dot.onclick = (e) => {
      e.stopPropagation();
      if (state === 'loading') return;

      if (state === 'success') {
        // GREEN → collapse translation, go to RED (detected)
        if (this._onCollapse) this._onCollapse(el);
      } else if (state === 'detected') {
        // RED → if cached expand, else request new translation
        if (this.hasTranslation(el)) {
          if (this._onExpand) this._onExpand(el);
        } else {
          if (this._onTranslate) this._onTranslate(el);
        }
      } else if (state === 'error') {
        if (this._retryCallback) this._retryCallback(el);
      }
    };
  }
};
