/**
 * Phrase Renderer v3 — lightweight inline translation boxes.
 *
 * Design principles:
 *   - Each phrase owns its own DOM container (no shared rendering)
 *   - Translated text uses NORMAL font weight (clean, secondary to original)
 *   - No bold/strong/emphasis forced on translation output
 *   - Compact, non-intrusive visual style
 */

const PhraseRenderer = {

  /** Create YELLOW square indicator */
  createIndicator(entryId) {
    const dot = document.createElement('span');
    dot.className = 'ds-ph-indicator ds-ph-detected';
    dot.setAttribute('data-ds-ph-id', entryId);
    dot.title = '短语已翻译，点击折叠';
    return dot;
  },

  /** Update indicator state */
  setState(indicator, state) {
    if (!indicator?.isConnected) return;
    const base = 'ds-ph-indicator';
    switch (state) {
      case 'detected':
        indicator.className = base + ' ds-ph-detected';
        indicator.title = '翻译已折叠，点击展开';
        indicator.style.cssText = '';
        break;
      case 'loading':
        indicator.className = base + ' ds-ph-loading';
        indicator.title = '正在翻译...';
        indicator.style.cssText = '';
        break;
      case 'success':
        indicator.className = base + ' ds-ph-success';
        indicator.style.cssText =
          'width:10px;height:10px;border-radius:2px;' +
          'background:#22c55e;border:none;' +
          'box-shadow:0 0 6px rgba(34,197,94,.6);' +
          'cursor:pointer;animation:none;display:inline-block;' +
          'margin-left:4px;vertical-align:middle;flex-shrink:0;pointer-events:auto';
        indicator.title = '翻译已展开，点击折叠';
        break;
      case 'error':
        indicator.className = base + ' ds-ph-error';
        indicator.title = '翻译失败，点击重试';
        indicator.style.cssText = '';
        break;
    }
  },

  /**
   * Create a simple, lightweight translation box for one phrase.
   *
   * @param {string} entryId     - Unique entry identifier
   * @param {string} translation - The translated text (normal font weight)
   * @param {Function} onRefresh - Refresh callback
   * @returns {HTMLElement}
   */
  createTranslationBox(entryId, translation, onRefresh) {
    const block = document.createElement('span');
    block.className = 'ds-ph-block';
    block.setAttribute('data-ds-ph-id', entryId);

    // Translation text — normal weight, clean styling
    const textSpan = document.createElement('span');
    textSpan.className = 'ds-ph-text';
    textSpan.textContent = translation;

    // Refresh button
    const refreshBtn = document.createElement('span');
    refreshBtn.className = 'ds-ph-refresh';
    refreshBtn.innerHTML = '&#x21bb;';
    refreshBtn.title = '重新翻译';
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (typeof onRefresh === 'function') onRefresh();
    });

    block.appendChild(textSpan);
    block.appendChild(refreshBtn);
    return block;
  },

  /** Update translation text (for refresh) */
  updateTranslationText(block, translation) {
    if (!block?.isConnected) return;
    const textSpan = block.querySelector('.ds-ph-text');
    if (textSpan) textSpan.textContent = translation;
  },

  /** Show loading state */
  showLoadingInBox(block) {
    if (!block?.isConnected) return;
    const textSpan = block.querySelector('.ds-ph-text');
    if (textSpan) textSpan.textContent = '...';
  },

  /** Remove with collapse animation */
  removeTranslationBox(block) {
    if (!block?.isConnected) return;
    block.classList.add('ds-ph-collapsing');
    setTimeout(() => { if (block.isConnected) block.remove(); }, 200);
  },

  /** Remove instantly (cleanup) */
  removeTranslationBoxImmediate(block) {
    if (block?.isConnected) block.remove();
  },
};
