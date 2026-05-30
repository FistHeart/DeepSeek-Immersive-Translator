/**
 * 滑词翻译 — 选中文字后浮窗翻译。包含复制/重译/关闭按钮，支持缓存即时显示。
 */
const SelectionTranslator = {
  _active: false, _popup: null, _shadow: null,

  enable() {
    if (this._active) return;
    this._active = true;
    this._build();
    document.addEventListener('mouseup', this._onSelect);
    // Click outside to dismiss
    document.addEventListener('mousedown', this._onClickOutside, true);
  },

  disable() {
    this._active = false;
    document.removeEventListener('mouseup', this._onSelect);
    document.removeEventListener('mousedown', this._onClickOutside, true);
    this._hide();
  },

  _build() {
    if (this._popup) return;
    const host = document.createElement('div');
    host.id = 'ds-sel-host';
    host.style.cssText = 'position:fixed;z-index:2147483647;display:none;pointer-events:auto;opacity:0;transition:opacity .15s;';
    this._shadow = host.attachShadow({ mode: 'closed' });
    this._shadow.innerHTML = `<style>
      :host{--bg:rgba(22,22,44,0.97);--border:rgba(129,140,248,0.35);--tx:#e5e7eb;--ac:#818cf8}
      .popup{max-width:360px;min-width:200px;padding:10px 14px;background:var(--bg);color:var(--tx);font:13px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans SC',sans-serif;border-radius:12px;border:1px solid var(--border);box-shadow:0 8px 32px rgba(0,0,0,.45);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
      .bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
      .tag{font-size:10px;color:var(--ac);text-transform:uppercase;letter-spacing:.5px}
      .btns{display:flex;gap:4px}
      .btn{width:24px;height:24px;border-radius:6px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:var(--tx);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;transition:all .15s;line-height:1}
      .btn:hover{background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.2)}
      .btn:active{transform:scale(.92)}
      .spin{width:14px;height:14px;border:2px solid rgba(129,140,248,.25);border-top-color:var(--ac);border-radius:50%;animation:dsSpin .6s linear infinite;margin:4px auto}
      @keyframes dsSpin{to{transform:rotate(360deg)}}
      @media(prefers-color-scheme:dark){:host{--bg:rgba(10,10,28,.97)}}
    </style>
    <div class="popup">
      <div class="bar"><span class="tag">DeepSeek</span><div class="btns"><button id="sCopy" title="复制">&#x2398;</button><button id="sRefresh" title="重译">&#x21bb;</button><button id="sClose" title="关闭">&times;</button></div></div>
      <div id="sContent"></div>
    </div>`;
    document.body.appendChild(host);
    this._popup = host;
    const s = this._shadow;
    s.getElementById('sClose').onclick = () => this._hide();
    s.getElementById('sCopy').onclick = () => { const t = s.getElementById('sContent').textContent; if (t && t !== '...') navigator.clipboard?.writeText(t); };
    s.getElementById('sRefresh').onclick = () => this._retry();
  },

  _lastText: null,
  _onSelect: Utils.debounce(function() {
    if (!SelectionTranslator._active) return;
    const sel = window.getSelection(); if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text || text.length < 3 || text.length > 4000) return SelectionTranslator._hide();
    // Skip selection inside plugin UI
    const range = sel.getRangeAt(0);
    if (range && TransCoord.isPluginNode(range.commonAncestorContainer)) return SelectionTranslator._hide();
    if (text === SelectionTranslator._lastText) return;
    SelectionTranslator._lastText = text;
    const range = sel.getRangeAt(0); const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return;
    SelectionTranslator._show(text, rect);
  }, 300),

  _onClickOutside(e) {
    if (!SelectionTranslator._popup) return;
    if (SelectionTranslator._popup.style.display === 'none') return;
    if (!SelectionTranslator._popup.contains(e.target)) SelectionTranslator._hide();
  },

  async _show(text, rect) {
    if (!this._popup) return;
    const s = this._shadow, content = s.getElementById('sContent');
    content.innerHTML = '<div class="spin"></div>';

    // Measure first, then position
    this._popup.style.display = 'block';
    this._popup.style.opacity = '0';
    const pw = Math.min(this._popup.offsetWidth || 360, window.innerWidth - 20);
    const ph = this._popup.offsetHeight || 80;
    let left = rect.left + rect.width / 2 - pw / 2;
    let top = rect.bottom + 10;
    if (top + ph > window.innerHeight - 10) top = rect.top - ph - 10;
    if (left < 10) left = 10; else if (left + pw > window.innerWidth - 10) left = window.innerWidth - pw - 10;
    this._popup.style.left = left + 'px';
    this._popup.style.top = Math.max(10, top) + 'px';
    requestAnimationFrame(() => { this._popup.style.opacity = '1'; });

    const prefs = await Storage.getPreferences();
    const v = TransValidator.validate(text, prefs.targetLang, 'selection');
    if (!v.valid) { content.textContent = '翻译失败：输入无效'; return; }

    let translation = await TransCache.get(text, prefs.targetLang);
    if (!translation) {
      try {
        translation = await Translator.translate(text, prefs.targetLang);
        if (translation) TransCache.set(text, prefs.targetLang, translation);
      } catch (e) { content.textContent = '翻译失败，请重试'; return; }
    }
    if (text === this._lastText) content.textContent = translation;
  },

  async _retry() {
    const t = this._lastText; if (!t) return;
    const s = this._shadow, content = s.getElementById('sContent');
    content.innerHTML = '<div class="spin"></div>';
    const prefs = await Storage.getPreferences();
    TransCache._mem.delete(t.trim() + '|' + prefs.targetLang);
    try {
      const translation = await Translator.translate(t, prefs.targetLang);
      if (translation) { TransCache.set(t, prefs.targetLang, translation); content.textContent = translation; }
    } catch (e) { content.textContent = '翻译失败，请重试'; }
  },

  _hide() { this._lastText = null; if (this._popup) { this._popup.style.opacity = '0'; setTimeout(() => { if (!this._lastText && this._popup) this._popup.style.display = 'none'; }, 150); } }
};
