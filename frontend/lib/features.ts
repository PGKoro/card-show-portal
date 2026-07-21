// Feature flags for functionality that's fully built but temporarily hidden
// from end users. To restore a feature, flip its flag back to true — no
// other code changes, deletions, or migrations needed.

// The card marketplace (vendors posting/managing inventory, Browse Cards,
// homepage "Recent listings", vendor profile inventory grids). Turned off
// because vendors aren't posting card inventory right now.
export const CARDS_FEATURE_ENABLED = false;
