/**
 * General utility functions.
 * No side effects. Pure helpers only.
 */

const Utils = {
  /**
   * Check if an element is likely part of the main content area.
   * Excludes nav, footer, sidebar, ads, and code blocks.
   */
  isContentArea(element) {
    if (!element || !element.tagName) return false;

    const tag = element.tagName.toLowerCase();
    const role = (element.getAttribute('role') || '').toLowerCase();
    const cls = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();

    // Excluded by tag
    const excludedTags = new Set([
      'script', 'style', 'noscript', 'iframe', 'svg',
      'nav', 'footer', 'header', 'aside', 'code', 'pre',
      'button', 'input', 'select', 'textarea', 'form',
      'img', 'video', 'audio', 'canvas', 'object', 'embed',
    ]);
    if (excludedTags.has(tag)) return false;

    // Excluded by role
    const excludedRoles = new Set([
      'navigation', 'banner', 'contentinfo', 'complementary',
      'search', 'form', 'button', 'menubar', 'toolbar',
    ]);
    if (excludedRoles.has(role)) return false;

    // Excluded by class/id patterns (ads, sidebar, nav, footer, portal, etc.)
    const excludedPatterns = [
      'nav', 'menu', 'sidebar', 'footer', 'header', 'banner',
      'advertisement', 'ad-', '-ad', '_ad', 'sponsor',
      'comment', 'share', 'social', 'related', 'recommend',
      'widget', 'popup', 'modal', 'cookie', 'gdpr',
      'code-block', 'highlight', 'syntax',
      // Wikipedia portal/dashboard sections
      'mp-dyk', 'mp-itn', 'mp-otd', 'mp-sister', 'mp-lang',
      'mp-right', 'mp-lower', 'mp-other', 'mp-banner', 'mp-top',
      'mw-editsection', 'mw-jump', 'infobox', 'navbox',
      'reflist', 'hatnote', 'dablink',
      // Other portal patterns
      'portal', 'interlanguage', 'wikibase',
    ];
    const classIdText = cls + ' ' + id;
    for (const pattern of excludedPatterns) {
      if (classIdText.includes(pattern)) return false;
    }

    // Check if element is hidden
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;

    return true;
  },

  /**
   * Extract readable text paragraphs from a container.
   * Returns paragraphs that contain meaningful content.
   */
  extractParagraphs(rootElement) {
    const paragraphs = [];

    // Collect all block-level text containers
    const candidates = rootElement.querySelectorAll(
      'p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, figcaption, div.text, div.content, article > div'
    );

    for (const el of candidates) {
      if (!this.isContentArea(el)) continue;
      if (el.closest('[data-ds-translated]')) continue; // Skip already translated

      const text = el.textContent.trim();
      if (!text) continue;

      // Skip very short text
      if (text.length < 20) continue;

      // Skip text that is mostly non-language (code, symbols, numbers)
      const langChars = text.replace(/[\s\d\W_]/g, '').length;
      if (langChars < 10) continue;

      paragraphs.push({
        element: el,
        text: text.substring(0, 5000), // Truncate very long text
        length: text.length,
      });
    }

    return paragraphs;
  },

  /**
   * Debounce a function call.
   */
  debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * Throttle a function call.
   */
  throttle(fn, limit = 300) {
    let inThrottle = false;
    return function (...args) {
      if (!inThrottle) {
        fn.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  },

  /**
   * Sleep for a given duration in milliseconds.
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  /**
   * Retry a function with exponential backoff.
   */
  async retry(fn, { maxRetries = 3, baseDelay = 1000, maxDelay = 10000 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        if (attempt === maxRetries) break;

        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        // Add jitter (±20%)
        const jitter = delay * (0.8 + Math.random() * 0.4);
        await this.sleep(jitter);
      }
    }
    throw lastError;
  },

  /**
   * Generate a unique ID for translation tracking.
   */
  generateId() {
    return 'ds_' + Math.random().toString(36).substring(2, 11);
  },

  /**
   * Escape HTML entities in a string — safe for insertion into innerHTML.
   * Uses textContent → innerHTML roundtrip for reliable escaping.
   */
  escHTML(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },
};
