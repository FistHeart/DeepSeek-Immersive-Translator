/** Reddit adapter — targets post content + comments, skips sidebar/header/sort controls. */
const AdapterReddit = {
  name: 'reddit',
  match: (host) => host.includes('reddit.com'),

  getContentRoot() {
    // Reddit puts post content in specific slots
    const post = document.querySelector('[data-testid="post-container"], .Post, [slot="post-content"]');
    if (post) return post;
    return Readability.findMainContent();
  },

  getSelectors() {
    // Reddit uses custom elements for comments
    return 'p,h1,h2,h3,[slot="comment"],.comment-content,shreddit-comment div[slot="commentBody"]';
  },

  filterElement(el) {
    const cls = (el.className || '').toLowerCase();
    // Skip Reddit UI chrome
    const skip = ['sort-bar', 'side-bar', 'trending', 'premium', 'promoted', 'ad-'];
    for (const s of skip) if (cls.includes(s)) return false;
    return true;
  }
};
