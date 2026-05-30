document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const apiKeyInput = $('apiKeyInput'), saveKeyBtn = $('saveKeyBtn'), clearKeyBtn = $('clearKeyBtn'), keyStatus = $('keyStatus');
  const targetLang = $('targetLang');
  const toggleHover = $('toggleHover'), toggleArticle = $('toggleArticle'), togglePhrase = $('togglePhrase'), toggleSelection = $('toggleSelection');
  const clearCacheBtn = $('clearCacheBtn'), statusSection = $('statusSection'), statusMessage = $('statusMessage');

  await init();

  saveKeyBtn.onclick = async () => { const k = apiKeyInput.value.trim(); if (!k) return show('请输入 API Key', 'error'); if (!k.startsWith('sk-')) return show('Key 应以 sk- 开头', 'error'); await Storage.setApiKey(k); await validate(); show('Key 已保存', 'success'); };
  clearKeyBtn.onclick = async () => { await Storage.clearApiKey(); apiKeyInput.value = ''; keyStatus.className = 'status-dot'; show('Key 已清除', 'info'); };
  targetLang.onchange = () => { Storage.setPreferences({ targetLang: targetLang.value }); notify('setLang', { lang: targetLang.value }); };
  clearCacheBtn.onclick = async () => { await Storage.clearCache(); show('缓存已清除', 'info'); };

  toggleHover.onchange = () => { const on = toggleHover.checked; Storage.setPreferences({ hoverEnabled: on }); notify('toggleHover', { enabled: on }); };
  toggleArticle.onchange = () => { const on = toggleArticle.checked; Storage.setPreferences({ articleEnabled: on }); notify('toggleArticle', { enabled: on }); };
  togglePhrase.onchange = () => { const on = togglePhrase.checked; Storage.setPreferences({ phraseEnabled: on }); notify('togglePhrase', { enabled: on }); };
  toggleSelection.onchange = () => { const on = toggleSelection.checked; Storage.setPreferences({ selectionEnabled: on }); notify('toggleSelection', { enabled: on }); };

  async function validate() { try { const r = await chrome.runtime.sendMessage({ action: 'validateKey' }); keyStatus.className = 'status-dot ' + (r.valid ? 'valid' : 'invalid'); keyStatus.title = r.valid ? '已连接' : (r.error || '无效'); } catch (e) { keyStatus.className = 'status-dot invalid'; } }
  function show(msg, type) { statusSection.style.display = 'block'; statusMessage.textContent = msg; statusMessage.className = 'status-message ' + type; setTimeout(() => statusSection.style.display = 'none', 4000); }
  function notify(action, data = {}) { chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => { if (tab?.id) chrome.tabs.sendMessage(tab.id, { action, ...data }).catch(() => {}); }); }

  async function init() {
    const key = await Storage.getApiKey();
    if (key) { apiKeyInput.type = 'text'; apiKeyInput.value = key.substring(0, 7) + '••••••••' + key.slice(-4); validate(); }
    apiKeyInput.onfocus = () => { if (apiKeyInput.value.includes('••••')) { apiKeyInput.type = 'password'; apiKeyInput.value = ''; apiKeyInput.placeholder = '输入新 Key (sk-...)'; } };
    const prefs = await Storage.getPreferences();
    targetLang.value = prefs.targetLang || 'zh-CN';
    toggleHover.checked = !!prefs.hoverEnabled;
    toggleArticle.checked = !!prefs.articleEnabled;
    togglePhrase.checked = !!prefs.phraseEnabled;
    toggleSelection.checked = !!prefs.selectionEnabled;
  }
});
