/** Twitter/X adapter — targets tweet text, skips metrics/sidebar/nav. */
const AdapterTwitter = {
  name: 'twitter',
  match: (host) => host.includes('x.com') || host.includes('twitter.com'),

  getContentRoot() {
    const timeline = document.querySelector('[data-testid="primaryColumn"], main');
    return timeline || Readability.findMainContent();
  },

  getSelectors() {
    return '[data-testid="tweetText"], article div[lang]';
  },

  filterElement(el) {
    // Twitter has many non-content spans — only keep tweet bodies
    if (el.closest('[data-testid="tweetText"]')) return true;
    if (el.matches('article div[lang]')) return true;
    // Skip metrics, buttons, avatars
    if (el.closest('[role="group"],[data-testid="app-bar-back"],nav')) return false;
    return false; // Rest is chrome
  }
};
