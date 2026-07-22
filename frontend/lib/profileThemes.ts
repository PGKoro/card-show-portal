// Preset color pairs for a vendor's public profile banner + avatar — reuses
// the site's existing brand palette (see globals.css) since there's no
// image-upload flow yet (User.banner_image_url/avatar_image_url).

export type ProfileTheme = "blue" | "crimson" | "teal" | "orange" | "charcoal";

type ThemeDefinition = {
  label: string;
  bannerGradient: string;
  avatarClassName: string;
  swatchClassName: string;
};

export const PROFILE_THEMES: Record<ProfileTheme, ThemeDefinition> = {
  blue: {
    label: "Blue",
    bannerGradient:
      "linear-gradient(135deg, var(--color-brand-blue) 0%, var(--color-brand-navy) 100%)",
    avatarClassName: "bg-brand-blue",
    swatchClassName: "bg-brand-blue",
  },
  crimson: {
    label: "Crimson",
    bannerGradient:
      "linear-gradient(135deg, var(--color-brand-red) 0%, var(--color-brand-gray-900) 100%)",
    avatarClassName: "bg-brand-red",
    swatchClassName: "bg-brand-red",
  },
  teal: {
    label: "Teal",
    bannerGradient:
      "linear-gradient(135deg, var(--color-brand-teal) 0%, var(--color-brand-gray-900) 100%)",
    avatarClassName: "bg-brand-teal",
    swatchClassName: "bg-brand-teal",
  },
  orange: {
    label: "Orange",
    bannerGradient:
      "linear-gradient(135deg, var(--color-brand-orange) 0%, var(--color-brand-gray-900) 100%)",
    avatarClassName: "bg-brand-orange",
    swatchClassName: "bg-brand-orange",
  },
  charcoal: {
    label: "Charcoal",
    bannerGradient:
      "linear-gradient(135deg, var(--color-brand-gray-900) 0%, var(--color-brand-navy) 100%)",
    avatarClassName: "bg-brand-gray-900",
    swatchClassName: "bg-brand-gray-900",
  },
};

export const PROFILE_THEME_OPTIONS = Object.entries(PROFILE_THEMES).map(([value, def]) => ({
  value: value as ProfileTheme,
  label: def.label,
  swatchClassName: def.swatchClassName,
}));

export function themeFor(value: string | undefined): ThemeDefinition {
  return PROFILE_THEMES[(value as ProfileTheme) ?? "blue"] ?? PROFILE_THEMES.blue;
}
