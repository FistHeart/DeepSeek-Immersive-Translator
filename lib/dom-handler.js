/**
 * Minimal DOM utilities — heavy lifting delegated to OverlayManager, ViewportTracker.
 */
const DOMHandler = {
  async waitForPageReady(timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (document.readyState === 'complete') { await Utils.sleep(300); return true; }
      await Utils.sleep(100);
    }
    return document.readyState === 'complete';
  },

  isValidTarget(element) {
    if (!element?.isConnected) return false;
    if (!Utils.isContentArea(element)) return false;
    return element.textContent.trim().length >= 20;
  }
};
