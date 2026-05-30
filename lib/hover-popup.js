/**
 * Hover-first translation popup with Shadow DOM isolation.
 * Auto-hides when original content leaves viewport.
 * Includes per-paragraph refresh button.
 */
const HoverPopup = {
  _active: false,
  _popup: null,
  _shadow: null,
  _currentEl: null,
  _hideTimer: null,
  _showTimer: null,
  _isShowing: false,

  enable() {
    if (this._active) return;
    this._active = true;
    this._buildPopup();
    document.addEventListener('mousemove', this._onMove, { passive: true });
    ViewportManager.onExit((el) => { if (el === this._currentEl) this.hide(); });
  },

  disable() {
    this._active = false;
    document.removeEventListener('mousemove', this._onMove);
    this.hide();
    if (this._popup) { this._popup.remove(); this._popup = null; this._shadow = null; }
  },

  /** Create Shadow DOM popup once, reuse forever */
  _buildPopup() {
    if (this._popup) return;
    const host = document.createElement('div');
    host.id = 'ds-hover-host';
    host.style.cssText = 'position:fixed;z-index:2147483647;display:none;pointer-events:auto;';
    this._shadow = host.attachShadow({ mode: 'closed' });
    this._shadow.innerHTML = `
      <style>
        :host { --ds-bg: rgba(22,22,44,0.96); --ds-border: rgba(129,140,248,0.35); --ds-text: #e5e7eb; --ds-accent: #818cf8; }
        .popup { max-width:380px; padding:10px 14px; background:var(--ds-bg); color:var(--ds-text); font:13px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans SC',sans-serif; border-radius:12px; border:1px solid var(--ds-border); box-shadow:0 8px 32px rgba(0,0,0,0.45); backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px); transition:opacity .15s; }
        .bar { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
        .lang-tag { font-size:10px; color:var(--ds-accent); text-transform:uppercase; letter-spacing:.5px; }
        .actions { display:flex; gap:6px; }
        .btn { width:22px;height:22px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:var(--ds-text);cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;transition:all .15s; }
        .btn:hover { background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.2); }
        .spinner { width:14px;height:14px;border:2px solid rgba(129,140,248,0.25);border-top-color:var(--ds-accent);border-radius:50%;animation:dsSpin .6s linear infinite; }
        @keyframes dsSpin { to{transform:rotate(360deg)} }
        @media (prefers-color-scheme:dark) { :host { --ds-bg:rgba(12,12,30,0.96); } }
      </style>
      <div class="popup" id="popup">
        <div class="bar"><span class="lang-tag" id="langTag"></span><div class="actions"><button class="btn" id="refreshBtn" title="Retranslate">&#x21bb;</button><button class="btn" id="closeBtn" title="Close">&times;</button></div></div>
        <div id="content"></div>
      </div>`;
    document.body.appendChild(host);
    this._popup = host;

    // Event listeners inside Shadow DOM
    this._shadow.getElementById('closeBtn').onclick = () => this.hide();
    this._shadow.getElementById('refreshBtn').onclick = () => {
      if (this._currentEl) this._retranslate(this._currentEl);
    };
  },

  _onMove: Utils.throttle(function(e) {
    if (!HoverPopup._active) return;
    const el = e.target.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption');
    if (!el || el === HoverPopup._currentEl) return;
    if (!Utils.isContentArea(el)) return HoverPopup.hide();
    const text = el.textContent.trim();
    if (text.length < 20 || text.length > 5000) return HoverPopup.hide();

    HoverPopup._currentEl = el;
    clearTimeout(HoverPopup._showTimer);
    HoverPopup._showTimer = setTimeout(() => HoverPopup._show(el, text, e.clientX, e.clientY), 250);
  }, 150),

  async _show(el, text, mx, my) {
    if (!this._popup) return;
    this._currentEl = el;
    clearTimeout(this._hideTimer);

    // Check cache
    const prefs = await Storage.getPreferences();
    let translation = await TransCache.get(text, prefs.targetLang);

    if (!translation) {
      // Show loading
      this._renderPopup('loading', prefs.targetLang);
      this._position(el, mx, my);
      try {
        translation = await Translator.translate(text, prefs.targetLang);
        if (translation) TransCache.set(text, prefs.targetLang, translation);
      } catch (e) {
        this._renderPopup('error', prefs.targetLang);
        return;
      }
    }

    if (this._currentEl !== el) return; // Moved away during fetch
    this._renderPopup(translation, prefs.targetLang);
    this._position(el, mx, my);
  },

  _renderPopup(content, lang) {
    if (!this._shadow) return;
    const contentEl = this._shadow.getElementById('content');
    const langTag = this._shadow.getElementById('langTag');
    if (langTag) langTag.textContent = lang;
    if (!contentEl) return;

    if (content === 'loading') {
      contentEl.innerHTML = '<div class="spinner"></div>';
    } else if (content === 'error') {
      contentEl.textContent = '翻译失败，点 ↻ 重试';
    } else {
      contentEl.textContent = content;
    }
    if (this._popup) this._popup.style.display = 'block';
    this._isShowing = true;
  },

  _position(el, mx, my) {
    if (!this._popup) return;
    const pw = this._popup.offsetWidth || 380;
    const ph = this._popup.offsetHeight || 100;
    const pos = PositionEngine.compute(el, mx, my, pw, ph);
    this._popup.style.left = pos.left + 'px';
    this._popup.style.top = pos.top + 'px';
  },

  async _retranslate(el) {
    const text = el.textContent.trim();
    if (!text) return;
    const prefs = await Storage.getPreferences();
    TransCache._mem.delete(text.trim() + '|' + prefs.targetLang);
    this._renderPopup('loading', prefs.targetLang);
    try {
      const translation = await Translator.translate(text, prefs.targetLang);
      if (translation) {
        TransCache.set(text, prefs.targetLang, translation);
        this._renderPopup(translation, prefs.targetLang);
      }
    } catch (e) { this._renderPopup('error', prefs.targetLang); }
  },

  hide() {
    clearTimeout(this._showTimer);
    this._currentEl = null;
    this._isShowing = false;
    this._hideTimer = setTimeout(() => {
      if (!this._isShowing && this._popup) this._popup.style.display = 'none';
    }, 200);
  }
};
