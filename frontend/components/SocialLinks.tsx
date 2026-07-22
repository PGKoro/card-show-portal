type SocialLinksProps = {
  instagramUrl?: string;
  youtubeUrl?: string;
  xUrl?: string;
  websiteUrl?: string;
};

const ICON_CLASS =
  "flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:border-brand-blue hover:text-brand-blue dark:border-gray-700 dark:text-gray-300";

// Renders a row of icon links for whichever social URLs are actually set —
// a vendor who left a field blank during onboarding/Profile Settings just
// doesn't get that icon at all, rather than showing a dead/greyed-out one.
export function SocialLinks({ instagramUrl, youtubeUrl, xUrl, websiteUrl }: SocialLinksProps) {
  const links = [
    { url: instagramUrl, label: "Instagram", icon: <InstagramIcon /> },
    { url: youtubeUrl, label: "YouTube", icon: <YouTubeIcon /> },
    { url: xUrl, label: "X", icon: <XIcon /> },
    { url: websiteUrl, label: "Website", icon: <WebsiteIcon /> },
  ].filter((link) => link.url);

  if (links.length === 0) return null;

  return (
    <div className="flex gap-2">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          title={link.label}
          className={ICON_CLASS}
        >
          {link.icon}
        </a>
      ))}
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function WebsiteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9s1.3-6.5 3.8-9z" />
    </svg>
  );
}
