/** ArXiv adapter — targets abstract + paper body, skips metadata bars. */
const AdapterArxiv = {
  name: 'arxiv',
  match: (host) => host.includes('arxiv.org'),

  getContentRoot() {
    const abs = document.querySelector('.abstract, #abs');
    return abs || Readability.findMainContent();
  },

  getSelectors() {
    return '.abstract p, #abs p, .mathjax, p, blockquote';
  },

  filterElement(el) {
    // Skip arXiv's navigation header and submission history
    if (el.closest('.extra-services,.submission-history,nav')) return false;
    return true;
  }
};
