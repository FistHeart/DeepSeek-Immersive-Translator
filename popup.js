/**
 * Popup Controller v4 — step-by-step guided setup with language confirmation.
 *
 * Flow:
 *   Step 1: Enter & save API key → unlocks Step 2
 *   Step 2: Select target language → Confirm → unlocks Step 3
 *   Step 3: Enable translation modes → ready
 *
 * Language state:
 *   pendingLanguage   — selected in dropdown (not yet applied)
 *   confirmedLanguage — confirmed via [Confirm] button (active translation target)
 *   On init: zh-CN is pre-confirmed (user can proceed immediately)
 */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);

  // ── DOM refs ────────────────────────────────────
  const apiKeyInput   = $('apiKeyInput');
  const saveKeyBtn    = $('saveKeyBtn');
  const clearKeyBtn   = $('clearKeyBtn');
  const keyStatus     = $('keyStatus');
  const keyFeedback   = $('keyFeedback');
  const targetLang    = $('targetLang');
  const confirmLangBtn = $('confirmLangBtn');
  const langFeedback   = $('langFeedback');
  const toggleHover    = $('toggleHover');
  const toggleArticle  = $('toggleArticle');
  const togglePhrase   = $('togglePhrase');
  const toggleSel      = $('toggleSelection');
  const clearCacheBtn  = $('clearCacheBtn');

  // ── Step containers ─────────────────────────────
  const step2 = $('step2');
  const step3 = $('step3');
  const step1Badge = $('step1Badge');
  const step2Badge = $('step2Badge');
  const step3Badge = $('step3Badge');

  // ── Language state ──────────────────────────────
  let pendingLanguage = 'zh-CN';
  let confirmedLanguage = 'zh-CN';
  let keyValidated = false;
  let langConfirmed = false;

  // ═══════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════

  await init();

  async function init() {
    const prefs = await Storage.getPreferences();

    // API key
    const key = await Storage.getApiKey();
    if (key) {
      apiKeyInput.type = 'text';
      apiKeyInput.value = key.substring(0, 7) + '••••••••' + key.slice(-4);
      validateKey();
    } else {
      apiKeyInput.type = 'password';
    }

    apiKeyInput.onfocus = () => {
      if (apiKeyInput.value.includes('••••')) {
        apiKeyInput.type = 'password';
        apiKeyInput.value = '';
        apiKeyInput.placeholder = '输入新 Key (sk-...)';
      }
    };

    // Target language — init with stored preference, zh-CN is DEFAULT confirmed
    const storedLang = prefs.targetLang || 'zh-CN';
    targetLang.value = storedLang;
    pendingLanguage = storedLang;
    confirmedLanguage = storedLang;

    // CRITICAL FIX: zh-CN is pre-confirmed on startup.
    // User does NOT need to switch and switch back.
    // The stored language (or default zh-CN) is immediately active.
    langConfirmed = true;
    updateLangUI('confirmed');

    // Translation toggles
    toggleHover.checked   = !!prefs.hoverEnabled;
    toggleArticle.checked = !!prefs.articleEnabled;
    togglePhrase.checked  = !!prefs.phraseEnabled;
    toggleSel.checked     = !!prefs.selectionEnabled;

    // Update step states
    if (key) {
      unlockStep2();
      if (langConfirmed) {
        unlockStep3();
      }
    }
  }

  // ═══════════════════════════════════════════════════
  //  STEP 1 — API Key
  // ═══════════════════════════════════════════════════

  saveKeyBtn.onclick = async () => {
    const k = apiKeyInput.value.trim();
    if (!k) return showFeedback(keyFeedback, '请输入 API Key', 'error');
    if (!k.startsWith('sk-')) return showFeedback(keyFeedback, 'API Key 应以 sk- 开头', 'error');

    saveKeyBtn.disabled = true;
    saveKeyBtn.textContent = '验证中...';
    showFeedback(keyFeedback, '正在验证...', 'info');

    try {
      await Storage.setApiKey(k);
      const valid = await validateKey();
      if (valid) {
        showFeedback(keyFeedback, 'API Key 验证成功', 'success');
        unlockStep2();
      } else {
        showFeedback(keyFeedback, 'API Key 无效，请检查', 'error');
      }
    } catch (e) {
      showFeedback(keyFeedback, '保存失败: ' + e.message, 'error');
    } finally {
      saveKeyBtn.disabled = false;
      saveKeyBtn.textContent = '保存并验证';
    }
  };

  clearKeyBtn.onclick = async () => {
    await Storage.clearApiKey();
    apiKeyInput.value = '';
    apiKeyInput.type = 'password';
    apiKeyInput.placeholder = 'sk-...';
    keyStatus.className = 'status-dot';
    keyStatus.title = '未验证';
    keyValidated = false;
    hideFeedback(keyFeedback);
    lockStep2();
    lockStep3();
  };

  async function validateKey() {
    try {
      const r = await chrome.runtime.sendMessage({ action: 'validateKey' });
      if (r.valid) {
        keyStatus.className = 'status-dot valid';
        keyStatus.title = '已连接';
        keyValidated = true;
        step1Badge.textContent = '已完成';
        step1Badge.className = 'step-badge step-badge--done';
        return true;
      } else {
        keyStatus.className = 'status-dot invalid';
        keyStatus.title = r.error || '无效';
        keyValidated = false;
        step1Badge.textContent = '必需';
        step1Badge.className = 'step-badge';
        return false;
      }
    } catch (e) {
      keyStatus.className = 'status-dot invalid';
      keyStatus.title = '无法连接';
      keyValidated = false;
      return false;
    }
  }

  // ═══════════════════════════════════════════════════
  //  STEP 2 — Target Language (with Confirm button)
  // ═══════════════════════════════════════════════════

  // Dropdown change → enters PENDING state (not yet applied)
  targetLang.onchange = () => {
    pendingLanguage = targetLang.value;

    if (pendingLanguage === confirmedLanguage) {
      // User selected the already-confirmed language → hide confirm
      updateLangUI('confirmed');
      hideFeedback(langFeedback);
    } else {
      // Different language selected → show confirm button
      updateLangUI('pending');
      showFeedback(langFeedback, '已选择「' + getLangName(pendingLanguage) + '」，点击确认生效', 'info');
    }
  };

  // Confirm button → commits pending language as active
  confirmLangBtn.onclick = () => {
    if (pendingLanguage === confirmedLanguage) return;

    confirmedLanguage = pendingLanguage;
    Storage.setPreferences({ targetLang: confirmedLanguage });
    notify('setLang', { lang: confirmedLanguage });

    if (!langConfirmed) {
      langConfirmed = true;
      unlockStep3();
    }

    updateLangUI('confirmed');
    hideFeedback(langFeedback);
    console.log('[DTI] Language confirmed: ' + confirmedLanguage);
  };

  function updateLangUI(state) {
    if (state === 'pending') {
      confirmLangBtn.style.display = 'inline-flex';
      step2Badge.textContent = '待确认';
      step2Badge.className = 'step-badge step-badge--ready';
    } else {
      confirmLangBtn.style.display = 'none';
      step2Badge.textContent = '已选择';
      step2Badge.className = 'step-badge step-badge--done';
    }
  }

  function getLangName(code) {
    const names = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文', 'en': 'English', 'ja': '日本語', 'ko': '한국어', 'fr': 'Français' };
    return names[code] || code;
  }

  // ═══════════════════════════════════════════════════
  //  STEP 3 — Translation Modes
  // ═══════════════════════════════════════════════════

  toggleHover.onchange = () => {
    Storage.setPreferences({ hoverEnabled: toggleHover.checked });
    notify('toggleHover', { enabled: toggleHover.checked });
    console.log('[DTI] Translation mode: Hover=' + (toggleHover.checked ? 'ON' : 'OFF'));
  };

  toggleArticle.onchange = () => {
    Storage.setPreferences({ articleEnabled: toggleArticle.checked });
    notify('toggleArticle', { enabled: toggleArticle.checked });
    console.log('[DTI] Translation mode: Article=' + (toggleArticle.checked ? 'ON' : 'OFF'));
  };

  togglePhrase.onchange = () => {
    Storage.setPreferences({ phraseEnabled: togglePhrase.checked });
    notify('togglePhrase', { enabled: togglePhrase.checked });
    console.log('[DTI] Translation mode: Phrase=' + (togglePhrase.checked ? 'ON' : 'OFF'));
  };

  toggleSel.onchange = () => {
    Storage.setPreferences({ selectionEnabled: toggleSel.checked });
    notify('toggleSelection', { enabled: toggleSel.checked });
    console.log('[DTI] Translation mode: Selection=' + (toggleSel.checked ? 'ON' : 'OFF'));
  };

  clearCacheBtn.onclick = async () => {
    await Storage.clearCache();
    showFeedback(keyFeedback, '翻译缓存已清除', 'info');
  };

  // ═══════════════════════════════════════════════════
  //  Step state helpers
  // ═══════════════════════════════════════════════════

  function unlockStep2() {
    step2.classList.remove('step--locked');
    targetLang.disabled = false;
    confirmLangBtn.disabled = false;
    if (pendingLanguage !== confirmedLanguage) {
      updateLangUI('pending');
    } else {
      updateLangUI('confirmed');
    }
    console.log('[DTI] Step 2 unlocked');
  }

  function lockStep2() {
    step2.classList.add('step--locked');
    targetLang.disabled = true;
    confirmLangBtn.disabled = true;
    langConfirmed = false;
    step2Badge.textContent = '待解锁';
    step2Badge.className = 'step-badge';
  }

  function unlockStep3() {
    step3.classList.remove('step--locked');
    toggleHover.disabled = false;
    toggleArticle.disabled = false;
    togglePhrase.disabled = false;
    toggleSel.disabled = false;
    step3Badge.textContent = '就绪';
    step3Badge.className = 'step-badge step-badge--ready';
    console.log('[DTI] Step 3 unlocked: translation modes available');
  }

  function lockStep3() {
    step3.classList.add('step--locked');
    toggleHover.disabled = true;
    toggleArticle.disabled = true;
    togglePhrase.disabled = true;
    toggleSel.disabled = true;
    step3Badge.textContent = '待解锁';
    step3Badge.className = 'step-badge';
  }

  // ═══════════════════════════════════════════════════
  //  Helpers
  // ═══════════════════════════════════════════════════

  function showFeedback(el, msg, type) {
    el.style.display = 'block';
    el.textContent = msg;
    el.className = 'feedback feedback--' + type;
    if (type === 'success' || type === 'error') {
      setTimeout(() => hideFeedback(el), 4000);
    }
  }

  function hideFeedback(el) {
    el.style.display = 'none';
    el.textContent = '';
  }

  function notify(action, data = {}) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { action, ...data }).catch(() => {});
    });
  }
});
