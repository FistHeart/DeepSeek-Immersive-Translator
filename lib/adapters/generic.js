/** Generic site adapter — works for most websites. Uses Readability engine to find main content. */
const AdapterGeneric = {
  name: 'generic',
  match: () => true, // Always matches as fallback

  /** Return the root element containing article content */
  getContentRoot() { return Readability.findMainContent(); },

  /** Custom paragraph selectors for generic sites */
  getSelectors() { return 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,figcaption'; },

  /** Override isContentArea for site-specific filtering */
  filterElement(el) { return true; }
};
