// Feature flags for functionality that's fully built but temporarily hidden
// from end users. To restore a feature, flip its flag back to true — no
// other code changes, deletions, or migrations needed.

// The card marketplace (vendors posting/managing inventory, Browse Cards,
// homepage "Recent listings", vendor profile inventory grids). Turned off
// because vendors aren't posting card inventory right now.
export const CARDS_FEATURE_ENABLED = false;

// The "Set Registry" nav link/page. The page itself is untouched — this
// only hides the entry point.
export const SET_REGISTRY_FEATURE_ENABLED = false;

// The Articles nav tab is NOT here — it's admin-toggleable at runtime via
// apps.core.models.SiteSettings.articles_tab_enabled (Manage Website's
// "Show Articles Tab" switch), not a build-time flag, since it needs to
// flip without a redeploy. See lib/SiteSettingsContext.tsx.
