/**
 * Wikipedia adapter — restricts scanning to actual article content.
 *
 * Wikipedia has several page types with different structures:
 *   /wiki/Article_Name  →  regular article (#mw-content-text)
 *   /wiki/Main_Page     →  portal/dashboard (#mp-* sections)
 *   /wiki/Wikipedia:*   →  meta pages (skip)
 *   /wiki/Talk:*        →  discussion pages (skip)
 *   /wiki/User:*        →  user pages (skip)
 *   /wiki/Portal:*      →  portal pages (skip)
 *   /wiki/Category:*    →  category listings (skip)
 *   /wiki/Help:*        →  help pages (skip)
 *   /wiki/Template:*    →  template pages (skip)
 *   /wiki/Special:*     →  special pages (skip)
 *
 * For Main Page: only scan #mp-tfa (Today's Featured Article text).
 * For articles: scan #mw-content-text, filtering infoboxes/navboxes/refs.
 * For everything else: skip completely.
 */
const AdapterWikipedia = {
  name: 'wikipedia',

  /** All Wikipedia language editions */
  match(host) {
    return host.includes('wikipedia.org');
  },

  /**
   * Returns the content root for Wikipedia pages.
   * Returns null for non-article pages (Main Page returns #mp-tfa only).
   */
  getContentRoot() {
    const path = location.pathname;
    const ns = this._getNamespace(path);

    // Non-article namespaces — skip entirely
    if (ns !== 'article' && ns !== 'main') {
      console.log('[DTI] Wikipedia namespace skipped:', ns);
      return null;
    }

    // Main Page: only scan featured article section
    if (ns === 'main') {
      const tfa = document.getElementById('mp-tfa');
      if (tfa) {
        console.log('[DTI] Wikipedia Main Page — scanning #mp-tfa only');
        return tfa;
      }
      // If no #mp-tfa found, this might not be a Main Page
      // Fall through to article logic
    }

    // Regular article: scan the proper content area
    const content = document.getElementById('mw-content-text') ||
                    document.getElementById('bodyContent') ||
                    document.querySelector('.mw-parser-output');
    if (content) return content;

    // Fallback
    return Readability.findMainContent();
  },

  /**
   * More restrictive selectors for Wikipedia.
   * Excludes list items (which are often navigation on portals).
   */
  getSelectors() {
    return 'p, h2, h3, h4, h5, h6, blockquote';
  },

  /**
   * Filter out Wikipedia chrome elements:
   *   - Infoboxes, navboxes, reference lists
   *   - Edit section links
   *   - Table of contents
   *   - "See also" / "External links" / "References" sections
   *   - Maintenance templates
   *   - Disambiguation notices
   */
  filterElement(el) {
    const cls = (el.className || '').toLowerCase();
    const id = (el.id || '').toLowerCase();

    // Infoboxes / navboxes / metadata
    const boxPatterns = [
      'infobox', 'navbox', 'navbox-', 'metadata', 'mbox',
      'ambox', 'tmbox', 'cmbox', 'ombox', 'fmbox', 'dmbox',
      'reflist', 'refbegin', 'refend', 'citation',
      'mw-editsection', 'mw-empty-elt',
      'sidebar', 'sisterproject', 'interlanguage',
      'noprint', 'nomobile',
    ];
    for (const p of boxPatterns) {
      if (cls.includes(p) || id.includes(p)) return false;
    }

    // Skip elements inside infobox/navbox/reference containers
    if (el.closest('.infobox, .navbox, .reflist, .references, ' +
      '#toc, .mw-editsection, .sidebar, .metadata, .ambox, ' +
      '.mbox, .hatnote, .dablink')) {
      return false;
    }

    // Skip if parent is a list in Main Page areas (DYK, ITN, OTD)
    if (el.closest('#mp-dyk, #mp-itn, #mp-otd, #mp-sister, #mp-lang, ' +
      '#mp-other, #mp-right, #mp-lower')) {
      return false;
    }

    // Skip disambiguation / hatnote
    if (el.closest('.hatnote, .dablink, [role="note"]')) return false;

    return true;
  },

  // ── Internal ──────────────────────────────────────

  /**
   * Determine Wikipedia namespace from URL path.
   * Returns 'main' (Main Page), 'article', or the namespace name.
   */
  _getNamespace(path) {
    // Main Page detection across all Wikipedia editions
    // Patterns: /wiki/Main_Page, /wiki/Pagina_principale, /wiki/メインページ, etc.
    const mainPageTitles = [
      'Main_Page', 'Pagina_principale', 'Wikipedia:Hauptseite',
      'Accueil', 'メインページ', '위키백과:대문', 'Portada',
      'Заглавная_страница', 'Hoofdpagina', 'Strona_główna',
    ];

    // /wiki/Main_Page or /wiki/Pagina_principale etc.
    const wikiMatch = path.match(/^\/wiki\/(.+)$/);
    if (wikiMatch) {
      const title = decodeURIComponent(wikiMatch[1]);
      if (mainPageTitles.some(t => title === t)) return 'main';

      // Check for known non-article namespaces
      const nsMatch = title.match(/^([^:]+):/);
      if (nsMatch) {
        const ns = nsMatch[1];
        const skipNS = ['Talk', 'User', 'Wikipedia', 'File', 'MediaWiki',
          'Template', 'Help', 'Category', 'Portal', 'Draft',
          'TimedText', 'Module', 'Special', 'WT', 'MOS'];
        if (skipNS.includes(ns)) return ns.toLowerCase();
      }
      return 'article';
    }

    return 'other';
  }
};
