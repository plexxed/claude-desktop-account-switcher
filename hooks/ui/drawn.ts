import { boundedMap } from '../platform/boundedMap'

// The last tree drawn at each site, and what it was drawn from. The desktop app
// loses a click whose press handle a redraw retired: pressing a Button focuses
// it, the focus redraws the site, and the engine gives every Button of a new
// tree new handles while the click still carries the old one (anthropics/
// claude-code#99395). A redraw from the same data answers the same tree, whose
// Buttons keep their handles, so the click lands.

// A site is a place, and the width it is drawn at when its tree depends on the
// width, so a pane being resized makes many; the ones drawn least recently go first.
const MAX_SITES = 32

const drawn = boundedMap<string, { from: string; tree: unknown }>(MAX_SITES)

/** Where a tree is drawn: its component, request and surface, then `parts` (a width, a part of it). */
export function siteOf(e: { component: string; requestId?: string; surface: string }, ...parts: (string | number)[]) {
  return [e.component, e.requestId, e.surface, ...parts].map(String).join('/')
}

/**
 * The tree last drawn at `site` when it was drawn from `from` too, else `draw()`'s,
 * kept for the next redraw. `from` is everything the tree shows, as a string.
 */
export async function keepTree<T>(site: string, from: string, draw: () => Promise<T> | T): Promise<T> {
  const kept = drawn.get(site)
  if (kept?.from === from) {
    return kept.tree as T
  }
  const tree = await draw()
  drawn.set(site, { from, tree })

  return tree
}
