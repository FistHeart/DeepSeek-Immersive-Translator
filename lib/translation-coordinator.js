/**
 * Translation Coordinator — global ownership registry + recursive-translation guard.
 *
 * HIGHEST PRIORITY RULE (enforced across ALL translation systems):
 *   NO feature may translate another feature's output.
 *   NO feature may translate plugin-generated UI nodes.
 *   ALL scanners must check ownership BEFORE extraction.
 *
 * Ownership priority:
 *   1. body-translation (highest — claims paragraphs first)
 *   2. phrase-translation (only content NOT owned by body)
 *   3. hover / selection (read-only — don't inject persistent blocks)
 *
 * DOM markers:
 *   data-immersive-ignore="true"    — plugin UI node, never scan
 *   data-immersive-owner="<type>"   — translated content, owned by <type>
 *
 * Usage:
 *   TransCoord.register(el, 'body-translation')
 *   TransCoord.isPluginNode(el)    → true if plugin UI
 *   TransCoord.isOwned(el)         → true if already translated
 *   TransCoord.getOwner(el)        → 'body-translation' | 'phrase-translation' | null
 *   TransCoord.canClaim(el, type)  → true if type can claim this element
 */

const TransCoord = {
  /** Element → owner type (body-translation | phrase-translation) */
  _owners: new WeakMap(),
  /** Set of all plugin-generated DOM nodes (indicators, blocks, popups) */
  _pluginNodes: new WeakSet(),

  // ═══════════════════════════════════════════════════
  //  Registration
  // ═══════════════════════════════════════════════════

  /**
   * Register an element as owned by a translation feature.
   * Called AFTER translation block is injected.
   */
  register(el, ownerType) {
    if (!el) return;
    this._owners.set(el, ownerType);
  },

  /**
   * Mark a DOM node as plugin-generated UI.
   * These nodes are NEVER scanned by any translation system.
   */
  markPluginNode(el) {
    if (!el) return;
    this._pluginNodes.add(el);
    // Also set attribute for CSS/querySelector-based skipping
    el.setAttribute('data-immersive-ignore', 'true');
  },

  // ═══════════════════════════════════════════════════
  //  Queries
  // ═══════════════════════════════════════════════════

  /** True if element is a plugin-generated UI node (indicator, block, popup) */
  isPluginNode(el) {
    if (!el) return false;
    return this._pluginNodes.has(el) || !!el.closest('[data-immersive-ignore="true"]');
  },

  /** True if element has already been translated by any feature */
  isOwned(el) {
    if (!el) return false;
    // Direct ownership
    if (this._owners.has(el)) return true;
    // Article territory marker
    if (el.hasAttribute('data-ds-art')) return true;
    // Phrase territory marker
    if (el.hasAttribute('data-ds-ph')) return true;
    // Inside a translated block
    if (el.closest('[data-ds-art-id]') || el.closest('[data-ds-ph-block]')) return true;
    return false;
  },

  /** Get which feature owns this element */
  getOwner(el) {
    if (!el) return null;
    if (el.hasAttribute('data-ds-art')) return 'body-translation';
    if (el.hasAttribute('data-ds-ph')) return 'phrase-translation';
    return this._owners.get(el) || null;
  },

  // ═══════════════════════════════════════════════════
  //  Claim checks (priority-based)
  // ═══════════════════════════════════════════════════

  /**
   * Check if a feature type can claim an element for translation.
   * body-translation always wins over phrase-translation.
   */
  canClaim(el, featureType) {
    if (!el) return false;
    // Plugin nodes — never claim
    if (this.isPluginNode(el)) return false;
    // Already owned by same feature — skip (prevent duplicate)
    if (this.getOwner(el) === featureType) return false;
    // body-translation can always claim (highest priority)
    if (featureType === 'body-translation') return true;
    // phrase-translation can only claim if NOT owned by body
    if (featureType === 'phrase-translation') {
      return this.getOwner(el) !== 'body-translation';
    }
    // hover/selection — check plugin node only
    return !this.isPluginNode(el);
  },

  // ═══════════════════════════════════════════════════
  //  Bulk operations
  // ═══════════════════════════════════════════════════

  /** Register a translation block and mark it as plugin UI */
  registerBlock(blockEl, ownerType) {
    this.markPluginNode(blockEl);
    if (blockEl.querySelector('.ds-art-retry')) {
      this.markPluginNode(blockEl.querySelector('.ds-art-retry'));
    }
    if (blockEl.querySelector('.ds-ph-refresh')) {
      this.markPluginNode(blockEl.querySelector('.ds-ph-refresh'));
    }
  },

  /** Clear all tracking (on extension stop) */
  clear() {
    this._owners = new WeakMap();
    this._pluginNodes = new WeakSet();
  }
};
