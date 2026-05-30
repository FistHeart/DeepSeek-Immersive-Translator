/**
 * Popup Controller v5 — guided workflow WITHOUT hard locking.
 *
 * Principles:
 *   - Steps are visually guided but never rigidly blocked
 *   - Default zh-CN is ALWAYS pre-confirmed — user proceeds immediately
 *   - Confirm button only gates LANGUAGE CHANGES, not step navigation
 *   - If current confirmed language is valid, all features are accessible
 *
 * Language state:
 *   pendingLanguage   — dropdown selection (may differ from active)
 *   confirmedLanguage — actively used for translation (always valid)
 *   On init: zh-CN (or stored lang) is pre-confirmed, ready to use
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
  // confirmedLanguage = what features actually use (ALWAYS valid)
  // pendingLanguage  = what's in the dropdown (may or may not match)
  let pendingLanguage = 'zh-CN';
  let confirmedLanguage = 'zh-CN';

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

    // Language: stored preference or zh-CN — ALWAYS pre-confirmed
    const storedLang = prefs.targetLang || 'zh-CN';
    targetLang.value = storedLang;
    pendingLanguage = storedLang;
    confirmedLanguage = storedLang;
    updateLangUI('confirmed');

    // Toggles
    toggleHover.checked   = !!prefs.hoverEnabled;
    toggleArticle.checked = !!prefs.articleEnabled;
    togglePhrase.checked  = !!prefs.phraseEnabled;
    toggleSel.checked     = !!prefs.selectionEnabled;

    // Navigation: Step 2 + Step 3 unlock together when API key is saved
    if (key) {
      unlockAllSteps();
    }
    // If no key yet, everything stays locked until user saves one
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
        // API key saved → unlock language + features together
        unlockAllSteps();
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
    hideFeedback(keyFeedback);
    lockAllSteps();
  };

  async function validateKey() {
    try {
      const r = await chrome.runtime.sendMessage({ action: 'validateKey' });
      if (r.valid) {
        keyStatus.className = 'status-dot valid';
        keyStatus.title = '已连接';
        step1Badge.textContent = '已完成';
        step1Badge.className = 'step-badge step-badge--done';
        return true;
      } else {
        keyStatus.className = 'status-dot invalid';
        keyStatus.title = r.error || '无效';
        step1Badge.textContent = '必需';
        step1Badge.className = 'step-badge';
        return false;
      }
    } catch (e) {
      keyStatus.className = 'status-dot invalid';
      keyStatus.title = '无法连接';
      return false;
    }
  }

  // ═══════════════════════════════════════════════════
  //  STEP 2 — Target Language
  // ═══════════════════════════════════════════════════
  //
  //  confirmedLanguage is ALWAYS valid (zh-CN default or stored).
  //  Changing dropdown → pending state (show confirm button).
  //  The OLD confirmed language remains active until confirm.
  //  Features always use confirmedLanguage — never blocked.

  targetLang.onchange = () => {
    pendingLanguage = targetLang.value;

    if (pendingLanguage === confirmedLanguage) {
      updateLangUI('confirmed');
      hideFeedback(langFeedback);
    } else {
      updateLangUI('pending');
      showFeedback(langFeedback,
        '当前生效: ' + getLangName(confirmedLanguage) + ' → 新选择: ' + getLangName(pendingLanguage),
        'info');
    }
  };

  confirmLangBtn.onclick = () => {
    if (pendingLanguage === confirmedLanguage) return;

    confirmedLanguage = pendingLanguage;
    Storage.setPreferences({ targetLang: confirmedLanguage });
    notify('setLang', { lang: confirmedLanguage });

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
  //
  //  Always accessible when API key is saved.
  //  Uses confirmedLanguage (always valid).
  //  NOT gated on language confirmation.

  toggleHover.onchange = () => {
    Storage.setPreferences({ hoverEnabled: toggleHover.checked });
    notify('toggleHover', { enabled: toggleHover.checked });
  };

  toggleArticle.onchange = () => {
    Storage.setPreferences({ articleEnabled: toggleArticle.checked });
    notify('toggleArticle', { enabled: toggleArticle.checked });
  };

  togglePhrase.onchange = () => {
    Storage.setPreferences({ phraseEnabled: togglePhrase.checked });
    notify('togglePhrase', { enabled: togglePhrase.checked });
  };

  toggleSel.onchange = () => {
    Storage.setPreferences({ selectionEnabled: toggleSel.checked });
    notify('toggleSelection', { enabled: toggleSel.checked });
  };

  clearCacheBtn.onclick = async () => {
    await Storage.clearCache();
    showFeedback(keyFeedback, '翻译缓存已清除', 'info');
  };

  // ═══════════════════════════════════════════════════
  //  Navigation — soft unlock (no hard gating)
  // ═══════════════════════════════════════════════════

  /** Unlock Steps 2 + 3 together. API key is the ONLY gate. */
  function unlockAllSteps() {
    // Step 2
    step2.classList.remove('step--locked');
    targetLang.disabled = false;
    confirmLangBtn.disabled = false;
    if (pendingLanguage !== confirmedLanguage) {
      updateLangUI('pending');
    } else {
      updateLangUI('confirmed');
    }

    // Step 3 — always unlocked with Step 2
    // confirmedLanguage is always valid (zh-CN default or stored)
    step3.classList.remove('step--locked');
    toggleHover.disabled = false;
    toggleArticle.disabled = false;
    togglePhrase.disabled = false;
    toggleSel.disabled = false;
    step3Badge.textContent = '就绪';
    step3Badge.className = 'step-badge step-badge--ready';

    console.log('[DTI] Steps 2+3 unlocked — active language: ' + confirmedLanguage);
  }

  /** Lock Steps 2 + 3 when API key is cleared */
  function lockAllSteps() {
    step2.classList.add('step--locked');
    targetLang.disabled = true;
    confirmLangBtn.disabled = true;
    step2Badge.textContent = '待解锁';
    step2Badge.className = 'step-badge';

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
