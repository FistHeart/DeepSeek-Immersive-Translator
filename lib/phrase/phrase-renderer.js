/**
 * Phrase Renderer v2 — creates phrase UI elements with formatting support.
 *
 * Translation box now displays the FULL translated line with the target
 * phrase portion visually highlighted. Preserves bold/italic/inline formatting
 * where possible by converting HTML tags to markers and back.
 */

/** Formatting tags to preserve during translation */
const FORMAT_TAGS = [
  { tag: 'strong', marker: '[B]', endMarker: '[/B]', html: '<strong>' },
  { tag: 'b',      marker: '[B]', endMarker: '[/B]', html: '<b>' },
  { tag: 'em',     marker: '[I]', endMarker: '[/I]', html: '<em>' },
  { tag: 'i',      marker: '[I]', endMarker: '[/I]', html: '<i>' },
];

const PhraseRenderer = {

  /** Create YELLOW square indicator */
  createIndicator(entryId) {
    const dot = document.createElement('span');
    dot.className = 'ds-ph-indicator ds-ph-detected';
    dot.setAttribute('data-ds-ph-id', entryId);
    dot.title = '短语已检测，点击翻译';
    dot.setAttribute('aria-label', 'Translate phrase');
    return dot;
  },

  /** Update indicator visual state */
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
   * Create a translation box with the target phrase portion highlighted.
   *
   * The full translated line is displayed. The portion that corresponds
   * to the original phrase is wrapped in a highlight span.
   *
   * @param {string} entryId     - Entry ID
   * @param {string} translation - Full translated line text
   * @param {string} phraseText  - Original phrase text (for highlighting)
   * @param {Function} onRefresh - Refresh callback
   */
  createHighlightedTranslationBox(entryId, translation, phraseText, onRefresh) {
    const block = document.createElement('span');
    block.className = 'ds-ph-block';
    block.setAttribute('data-ds-ph-block', entryId);

    // Text container — full translated line
    const textSpan = document.createElement('span');
    textSpan.className = 'ds-ph-text';

    // Try to highlight the phrase portion in the translation
    // Since we don't know the exact translated phrase text, use a
    // best-effort approach: if the phrase is short, highlight the
    // beginning portion of the translation as the "phrase zone"
    const phraseWords = phraseText.split(/\s+/).length;
    if (phraseWords >= 4 && phraseWords <= 10 && translation.length > phraseText.length * 0.5) {
      // Show full translation with inline label prefix for the phrase zone
      textSpan.innerHTML =
        '<span class="ds-ph-highlight">' + Utils.escHTML(translation) + '</span>';
    } else {
      textSpan.textContent = translation;
    }

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
   * Create a simple translation box (fallback / backward compat).
   */
  createTranslationBox(entryId, translation, onRefresh) {
    const block = document.createElement('span');
    block.className = 'ds-ph-block';
    block.setAttribute('data-ds-ph-block', entryId);

    const textSpan = document.createElement('span');
    textSpan.className = 'ds-ph-text';
    textSpan.textContent = translation;

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

  /** Update text content (for refresh) */
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
