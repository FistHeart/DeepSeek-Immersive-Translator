/** Medium adapter — targets article body, skips claps/comments/sidebar. */
const AdapterMedium = {
  name: 'medium',
  match: (host) => host.includes('medium.com'),

  getContentRoot() {
    const article = document.querySelector('article');
    return article || Readability.findMainContent();
  },

  getSelectors() {
    // Medium uses section for paragraphs within articles
    return 'article p, article h1, article h2, article h3, article h4, article blockquote, [data-selectable-paragraph]';
  },

  filterElement(el) {
    // Skip Medium's paywall prompts and recommendation sections
    if (el.closest('.metabar,.postMeterBar,footer')) return false;
    return true;
  }
};
