/**
 * Content Script v5 — Multi-mode immersive translation with global coordination.
 *
 * TranslationCoordinator (TransCoord) enforces the highest-priority rule:
 *   NO translation feature may scan or translate plugin-generated UI nodes.
 *   NO feature may translate content already owned by another feature.
 *
 * Four independent modes: Hover, Article, Phrase, Selection.
 */
(function () {
  'use strict';
  let targetLang = 'zh-CN', hoverOn = false, articleOn = false, phraseOn = false, selectionOn = false, _obs = null;

  chrome.runtime.onMessage.addListener((m, s, r) => {
    if (m.action === 'toggleHover') { m.enabled ? (hoverOn = true, HoverPopup.enable(), preload()) : (hoverOn = false, HoverPopup.disable()); r({ ok: true }); return true; }
    if (m.action === 'toggleArticle') { m.enabled ? (articleOn = true, ArticleTranslator.start(), preload()) : (articleOn = false, ArticleTranslator.stop()); r({ ok: true }); return true; }
    if (m.action === 'togglePhrase') { m.enabled ? (phraseOn = true, PhraseModule.start()) : (phraseOn = false, PhraseModule.stop()); r({ ok: true }); return true; }
    if (m.action === 'toggleSelection') { m.enabled ? (selectionOn = true, SelectionTranslator.enable()) : (selectionOn = false, SelectionTranslator.disable()); r({ ok: true }); return true; }
    if (m.action === 'setLang') { targetLang = m.lang; Storage.setPreferences({ targetLang }); r({ ok: true }); }
    if (m.action === 'getStatus') { r({ hoverOn, articleOn, phraseOn, selectionOn, cached: TransCache._mem.size }); }
  });

  function preload() {
    DOMHandler.waitForPageReady().then(() => {
      ViewportManager.start();
      DOMScanner.startWatching(p => TransQueue.add(p));
      TransQueue.addBatch(DOMScanner.scan());
    });
  }

  /**
   * Global MutationObserver with coordinator filtering.
   *
   * CRITICAL: ALL added nodes pass through the coordinator BEFORE
   * any translation system. Plugin nodes + already-owned content
   * are filtered out at this level — no feature ever sees them.
   */
  function ensureObs() {
    if (_obs) return;
    _obs = new MutationObserver(Utils.debounce((mx) => {
      const added = [];
      for (const m of mx) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          // GLOBAL FILTER: skip all plugin-generated UI nodes
          if (TransCoord.isPluginNode(n)) continue;
          added.push(n);
        }
      }
      if (added.length) {
        DOMScanner.observeNew(added);
        ArticleTranslator.feedNewNodes(added);
        if (phraseOn) PhraseModule.feedNewNodes(added);
      }
    }, 400));
    _obs.observe(document.body, { childList: true, subtree: true });
  }

  Storage.getPreferences().then(p => {
    targetLang = p.targetLang || 'zh-CN';
    if (p.hoverEnabled) { hoverOn = true; HoverPopup.enable(); }
    if (p.articleEnabled) { articleOn = true; ArticleTranslator.start(); }
    if (p.phraseEnabled) { phraseOn = true; PhraseModule.start(); }
    if (p.selectionEnabled) { selectionOn = true; SelectionTranslator.enable(); }
    if (hoverOn || articleOn || phraseOn) { ensureObs(); preload(); }
  });
})();
