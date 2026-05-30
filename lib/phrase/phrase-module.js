/**
 * Phrase Module — main entry point for the Phrase Translation system.
 *
 * This is the ONLY public API that content.js interacts with.
 * All internal modules (detector, renderer, translator, lifecycle, cache)
 * are wired together here.
 *
 * Public API (mirrors old ArticlePhraseTranslator for drop-in compatibility):
 *   PhraseModule.start(root?)       — Start phrase detection + observation
 *   PhraseModule.stop()             — Stop detection, clean up all DOM
 *   PhraseModule.feedNewNodes(arr)  — Process dynamically added nodes
 *
 * Isolation guarantees:
 *   - Does NOT touch [data-ds-art] elements (Article Translator territory)
 *   - Does NOT touch ParaState._map elements
 *   - Does NOT interfere with HoverPopup or SelectionTranslator
 *   - Own cache namespace (PhraseCache, prefixed keys)
 *   - Own DOM classes (ds-ph-* prefix, not ds-status/ds-art-*)
 */
const PhraseModule = {
  _active: false,
  _seen: new WeakSet(),
  _nextId: 0,
  _observer: null,

  /**
   * Start phrase detection.
   * Scans entire document.body for phrase candidates (phrases can appear
   * anywhere, not just in main content).
   *
   * @param {HTMLElement} [root] — Optional scan root (defaults to document.body)
   */
  start(root) {
    if (this._active) return;
    this._active = true;

    console.log('[DTI] Phrase Module started — detecting 2-10 word English phrases outside articles');

    const scanRoot = root || document.body;
    this._scan(scanRoot);
    this._startObserver();
  },

  /**
   * Stop phrase detection and clean up all DOM artifacts.
   */
  stop() {
    this._active = false;

    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    PhraseLifecycle.clearAll();
    this._seen = new WeakSet();
    this._nextId = 0;

    console.log('[DTI] Phrase Module stopped');
  },

  /**
   * Process dynamically added DOM nodes (called from content.js MutationObserver).
   * Only processes if module is active.
   *
   * @param {HTMLElement[]} nodes — Array of newly added DOM nodes
   */
  feedNewNodes(nodes) {
    if (!this._active) return;
    if (!nodes?.length) return;

    let found = 0;

    for (const node of nodes) {
      if (node.nodeType !== 1) continue;

      // Check the node itself
      if (this._processElement(node)) {
        found++;
      }

      // Check descendants matching phrase selectors
      if (node.querySelectorAll) {
        const descendants = node.querySelectorAll(PhraseDetector._selectors);
        for (const el of descendants) {
          if (this._processElement(el)) {
            found++;
          }
        }
      }
    }

    if (found) {
      console.log('[DTI] Phrase detected from dynamic content: count=' + found);
    }
  },

  // ═══════════════════════════════════════════════════
  //  Internal — Scanning
  // ═══════════════════════════════════════════════════

  /**
   * Full scan of a root for phrase candidates.
   * Each qualifying element gets an indicator attached.
   */
  _scan(root) {
    if (!root) return;

    const candidates = PhraseDetector.scan(root, this._seen);
    let attached = 0;

    for (const { element, text } of candidates) {
      this._attach(element);
      attached++;
    }

    if (attached) {
      console.log('[DTI] Phrase scan complete: found=' + attached);
    }
  },

  /**
   * Process a single element — check if it's a new phrase candidate
   * and attach indicator if so. Returns true if attached.
   */
  _processElement(el) {
    if (this._seen.has(el)) return false;
    if (!PhraseDetector.isCandidate(el)) return false;

    this._seen.add(el);
    this._attach(el);
    return true;
  },

  /**
   * Attach a YELLOW indicator to a qualifying element.
   * Registers the element with the lifecycle manager.
   */
  _attach(el) {
    const entryId = 'ph-' + (++this._nextId);
    // Prevent double-attach
    if (PhraseLifecycle.get(entryId)) return;
    if (PhraseLifecycle.has(el)) return;

    // Add data attribute to mark as phrase territory (prevents duplicate detection)
    el.setAttribute('data-ds-ph', entryId);

    PhraseLifecycle.register(el, entryId);
  },

  // ═══════════════════════════════════════════════════
  //  Internal — Observer
  // ═══════════════════════════════════════════════════

  /**
   * Start IntersectionObserver for lazy phrase detection.
   * Only fires for elements entering the viewport — avoids processing
   * off-screen content on long/infinite-scroll pages.
   *
   * Performance design:
   *   - Uses IntersectionObserver (browser-optimized, no polling)
   *   - 400px rootMargin for pre-loading near-viewport phrases
   *   - One-time observation: unobserve after processing
   */
  _startObserver() {
    if (this._observer) this._observer.disconnect();

    this._observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;

        // Unobserve immediately — each element processed at most once
        this._observer.unobserve(el);

        if (this._seen.has(el)) continue;
        if (!PhraseDetector.isCandidate(el)) continue;

        this._seen.add(el);
        this._attach(el);

        const wc = Classifier.englishWordCount(el.textContent);
        console.log('[DTI] Phrase detected via viewport: wordCount=' + wc);
      }
    }, { rootMargin: '400px 0px' });

    // Observe all potential phrase elements
    const root = document.body;
    if (!root) return;

    const candidates = root.querySelectorAll(PhraseDetector._selectors);
    let observed = 0;

    for (const el of candidates) {
      if (this._seen.has(el)) continue;

      // Quick pre-filter to avoid observing obviously wrong elements
      const tag = el.tagName;
      if (PhraseDetector._excludedTags.has(tag)) continue;

      this._observer.observe(el);
      observed++;
    }

    if (observed) {
      console.log('[DTI] Phrase observer started: observing=' + observed + ' elements');
    }
  }
};
