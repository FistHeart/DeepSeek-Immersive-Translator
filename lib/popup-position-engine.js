/** Intelligent popup positioning — avoids clipping, follows cursor, repositions on scroll. */
const PositionEngine = {
  /** Calculate best position for a popup relative to target element + mouse position */
  compute(el, mouseX, mouseY, popupW, popupH) {
    const rect = el.getBoundingClientRect();
    const gap = 12;
    const margin = 10;
    const vw = window.innerWidth, vh = window.innerHeight;

    // Prefer right of element, aligned with mouse Y
    let left = rect.right + gap;
    let top = mouseY - popupH / 2;

    // Clamp vertically
    if (top < margin) top = margin;
    if (top + popupH > vh - margin) top = vh - popupH - margin;

    // If right side doesn't fit, try left
    if (left + popupW > vw - margin) {
      left = rect.left - popupW - gap;
      if (left < margin) {
        // Neither side fits — center below
        left = Math.max(margin, (rect.left + rect.right) / 2 - popupW / 2);
        top = rect.bottom + gap;
        if (top + popupH > vh - margin) top = rect.top - popupH - gap;
      }
    }

    return { left: Math.max(margin, left), top: Math.max(margin, top) };
  }
};
