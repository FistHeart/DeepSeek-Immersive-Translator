/**
 * Phrase Renderer — creates and manages all phrase UI elements.
 *
 * Indicator lifecycle (square button appended to phrase element):
 *   'detected' → YELLOW square  — phrase found, translation collapsed
 *   'loading'  → spinner        — translation in progress
 *   'success'  → GREEN square   — translation visible
 *   'error'    → RED square     — translation failed, retry available
 *
 * Translation box: compact inline block inserted after the phrase element.
 * Contains translated text + refresh button.
 */
const PhraseRenderer = {

  /**
   * Create a YELLOW square indicator and append to element.
   * Returns the indicator DOM node.
   */
  createIndicator(entryId) {
    const dot = document.createElement('span');
    dot.className = 'ds-ph-indicator ds-ph-detected';
    dot.setAttribute('data-ds-ph-id', entryId);
    dot.title = '短语已检测，点击翻译';
    dot.setAttribute('aria-label', 'Translate phrase');
    // Inline-block so it flows naturally next to text
    return dot;
  },

  /**
   * Update indicator class and tooltip based on state.
   * Uses direct className replacement (not additive) to avoid stale classes.
   */
  setState(indicator, state) {
    if (!indicator?.isConnected) return;

    const base = 'ds-ph-indicator';

    switch (state) {
      case 'detected':
        indicator.className = base + ' ds-ph-detected';
        indicator.title = '短语已检测，点击翻译';
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
        indicator.title = '翻译完成，点击折叠';
        break;

      case 'error':
        indicator.className = base + ' ds-ph-error';
        indicator.title = '翻译失败，点击重试';
        indicator.style.cssText = '';
        break;
    }
  },

  /**
   * Create the embedded phrase translation box.
   * Inserted after the phrase element via insertAdjacentElement('afterend', ...).
   *
   * @param {string} entryId   - Stable entry ID for DOM attribute
   * @param {string} translation - Translated text
   * @param {Function} onRefresh - Callback when refresh button clicked
   * @returns {HTMLElement} The translation box element
   */
  createTranslationBox(entryId, translation, onRefresh) {
    const block = document.createElement('span');
    block.className = 'ds-ph-block';
    block.setAttribute('data-ds-ph-block', entryId);

    // Translation text
    const textSpan = document.createElement('span');
    textSpan.className = 'ds-ph-text';
    textSpan.textContent = translation;

    // Refresh button
    const refreshBtn = document.createElement('span');
    refreshBtn.className = 'ds-ph-refresh';
    refreshBtn.innerHTML = '&#x21bb;';
    refreshBtn.title = '重新翻译';
    refreshBtn.setAttribute('aria-label', 'Retranslate phrase');
    refreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (typeof onRefresh === 'function') onRefresh();
    });

    block.appendChild(textSpan);
    block.appendChild(refreshBtn);
    return block;
  },

  /**
   * Update the text content of an existing translation box.
   * Used by refresh to swap translation without recreating DOM.
   */
  updateTranslationText(block, translation) {
    if (!block?.isConnected) return;
    const textSpan = block.querySelector('.ds-ph-text');
    if (textSpan) textSpan.textContent = translation;
  },

  /**
   * Show loading state inside translation box (during refresh).
   */
  showLoadingInBox(block) {
    if (!block?.isConnected) return;
    const textSpan = block.querySelector('.ds-ph-text');
    if (textSpan) textSpan.textContent = '...';
  },

  /**
   * Remove a translation box with a brief collapse animation.
   * The CSS transition handles opacity/size; removal happens after animation.
   */
  removeTranslationBox(block) {
    if (!block?.isConnected) return;
    block.classList.add('ds-ph-collapsing');
    // Clean up after CSS transition (200ms)
    setTimeout(() => {
      if (block.isConnected) block.remove();
    }, 200);
  },

  /**
   * Remove translation box instantly (no animation). Used for cleanup.
   */
  removeTranslationBoxImmediate(block) {
    if (block?.isConnected) block.remove();
  },
};
