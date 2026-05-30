/**
 * Popup Controller v3 — step-by-step guided setup UX.
 *
 * Flow:
 *   Step 1: Enter & save API key → unlocks Step 2
 *   Step 2: Select target language → unlocks Step 3
 *   Step 3: Enable translation modes → ready
 *
 * Each step is locked until the previous step completes.
 * Translation features are always accessible once configured.
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
  const toggleHover   = $('toggleHover');
  const toggleArticle = $('toggleArticle');
  const togglePhrase  = $('togglePhrase');
  const toggleSel     = $('toggleSelection');
  const clearCacheBtn = $('clearCacheBtn');

  // ── Step containers ─────────────────────────────
  const step2 = $('step2');
  const step3 = $('step3');
  const step1Badge = $('step1Badge');
  const step2Badge = $('step2Badge');
  const step3Badge = $('step3Badge');

  // ── State ───────────────────────────────────────
  let keyValidated = false;
  let langSelected = false;

  // ═══════════════════════════════════════════════════
  //  INIT — restore saved state
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

    // Target language
    targetLang.value = prefs.targetLang || 'zh-CN';

    // Translation toggles
    toggleHover.checked   = !!prefs.hoverEnabled;
    toggleArticle.checked = !!prefs.articleEnabled;
    togglePhrase.checked  = !!prefs.phraseEnabled;
    toggleSel.checked     = !!prefs.selectionEnabled;

    // Update step states based on stored config
    if (key) {
      unlockStep2();
      if (prefs.targetLang) {
        langSelected = true;
        unlockStep3();
      }
    }
  }

  // ═══════════════════════════════════════════════════
  //  STEP 1 — API Key
  // ═══════════════════════════════════════════════════

  saveKeyBtn.onclick = async () => {
    const k = apiKeyInput.value.trim();
    if (!k) return showFeedback('请输入 API Key', 'error');
    if (!k.startsWith('sk-')) return showFeedback('API Key 应以 sk- 开头', 'error');

    saveKeyBtn.disabled = true;
    saveKeyBtn.textContent = '验证中...';
    showFeedback('正在验证...', 'info');

    try {
      await Storage.setApiKey(k);
      const valid = await validateKey();
      if (valid) {
        showFeedback('API Key 验证成功', 'success');
        unlockStep2();
      } else {
        showFeedback('API Key 无效，请检查', 'error');
      }
    } catch (e) {
      showFeedback('保存失败: ' + e.message, 'error');
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
    hideFeedback();
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
  //  STEP 2 — Target Language
  // ═══════════════════════════════════════════════════

  targetLang.onchange = () => {
    const lang = targetLang.value;
    Storage.setPreferences({ targetLang: lang });
    notify('setLang', { lang });

    if (!langSelected) {
      langSelected = true;
      unlockStep3();
    }

    step2Badge.textContent = '已选择';
    step2Badge.className = 'step-badge step-badge--done';
    console.log('[DTI] Target language selected: ' + lang);
  };

  // ═══════════════════════════════════════════════════
  //  STEP 3 — Translation Modes
  // ═══════════════════════════════════════════════════

  toggleHover.onchange = () => {
    const on = toggleHover.checked;
    Storage.setPreferences({ hoverEnabled: on });
    notify('toggleHover', { enabled: on });
    console.log('[DTI] Translation mode: Hover=' + (on ? 'ON' : 'OFF'));
  };

  toggleArticle.onchange = () => {
    const on = toggleArticle.checked;
    Storage.setPreferences({ articleEnabled: on });
    notify('toggleArticle', { enabled: on });
    console.log('[DTI] Translation mode: Article=' + (on ? 'ON' : 'OFF'));
  };

  togglePhrase.onchange = () => {
    const on = togglePhrase.checked;
    Storage.setPreferences({ phraseEnabled: on });
    notify('togglePhrase', { enabled: on });
    console.log('[DTI] Translation mode: Phrase=' + (on ? 'ON' : 'OFF'));
  };

  toggleSel.onchange = () => {
    const on = toggleSel.checked;
    Storage.setPreferences({ selectionEnabled: on });
    notify('toggleSelection', { enabled: on });
    console.log('[DTI] Translation mode: Selection=' + (on ? 'ON' : 'OFF'));
  };

  clearCacheBtn.onclick = async () => {
    await Storage.clearCache();
    showFeedback('翻译缓存已清除', 'info');
  };

  // ═══════════════════════════════════════════════════
  //  Step state helpers
  // ═══════════════════════════════════════════════════

  function unlockStep2() {
    step2.classList.remove('step--locked');
    targetLang.disabled = false;
    step2Badge.textContent = '待选择';
    step2Badge.className = 'step-badge step-badge--ready';
    console.log('[DTI] Step 2 unlocked: target language selection available');
  }

  function lockStep2() {
    step2.classList.add('step--locked');
    targetLang.disabled = true;
    langSelected = false;
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

  function showFeedback(msg, type) {
    keyFeedback.style.display = 'block';
    keyFeedback.textContent = msg;
    keyFeedback.className = 'feedback feedback--' + type;
    if (type === 'success' || type === 'error') {
      setTimeout(hideFeedback, 4000);
    }
  }

  function hideFeedback() {
    keyFeedback.style.display = 'none';
    keyFeedback.textContent = '';
  }

  function notify(action, data = {}) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { action, ...data }).catch(() => {});
    });
  }
});
