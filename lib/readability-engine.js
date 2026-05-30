/**
 * Readability Engine — deep content analysis beyond simple tag matching.
 * Scores elements by likelihood of being article body content.
 * Uses text density, link density, semantic structure for classification.
 */
const Readability = {
  /**
   * Score an element: higher = more likely to be article content.
   * Returns 0-100. Elements scoring < 30 are likely nav/ads/sidebar.
   */
  scoreElement(el) {
    if (!el?.textContent) return 0;
    const text = el.textContent;
    const textLen = text.trim().length;
    if (textLen < 50) return 0;

    let score = 0;

    // 1. Text density (characters per child element)
    const childCount = el.children.length || 1;
    const density = textLen / childCount;
    if (density > 200) score += 30;
    else if (density > 100) score += 15;

    // 2. Link density (lower is better for article content)
    const links = el.querySelectorAll('a');
    const linkText = [...links].reduce((s, a) => s + (a.textContent?.length || 0), 0);
    const linkRatio = linkText / (textLen || 1);
    if (linkRatio < 0.1) score += 25;
    else if (linkRatio < 0.3) score += 10;
    else score -= 20; // Heavy links = nav/sidebar

    // 3. Semantic tags presence
    const articleTags = el.querySelectorAll('article,main,[role="main"]');
    if (articleTags.length > 0 || el.matches('article,main,[role="main"]')) score += 20;

    // 4. Paragraph count
    const paras = el.querySelectorAll('p');
    if (paras.length > 10) score += 15;
    else if (paras.length > 3) score += 8;

    // 5. Image ratio (too many images = not article text)
    const imgs = el.querySelectorAll('img,picture,video');
    const imgRatio = imgs.length / (Math.max(paras.length, 1));
    if (imgRatio > 2) score -= 15;

    // 6. Semantic class/id patterns
    const classId = ((el.className||'') + ' ' + (el.id||'')).toLowerCase();
    const contentPatterns = ['article', 'post', 'content', 'body', 'text', 'entry', 'story'];
    const nonContentPatterns = ['nav', 'sidebar', 'footer', 'header', 'menu', 'comment', 'ad', 'widget', 'related', 'recommend'];
    for (const p of contentPatterns) if (classId.includes(p)) score += 10;
    for (const p of nonContentPatterns) if (classId.includes(p)) score -= 20;

    return Math.max(0, Math.min(100, score));
  },

  wordCount(text) { if (!text) return 0; const s = text.trim(); return (s.match(/[a-zA-ZÀ-ɏЀ-ӿ؀-ۿ]+/g) || []).length + (s.match(/[一-鿿㐀-䶿぀-ゟ゠-ヿ가-힯]/g) || []).length; },

  /** Find the main content container on the page */
  findMainContent() {
    let best = document.body;
    let bestScore = 0;
    // Check major containers
    const candidates = document.querySelectorAll('article,main,[role="main"],.post,.article,.content,.entry,#content,#article,#main,.post-content,.article-content');
    for (const el of candidates) {
      const score = this.scoreElement(el);
      if (score > bestScore) { bestScore = score; best = el; }
    }
    // If nothing found, try scoring divs
    if (bestScore < 40) {
      for (const div of document.querySelectorAll('div')) {
        const score = this.scoreElement(div);
        if (score > bestScore && div.querySelectorAll('p').length >= 3) {
          bestScore = score; best = div;
        }
      }
    }
    return best;
  }
};
