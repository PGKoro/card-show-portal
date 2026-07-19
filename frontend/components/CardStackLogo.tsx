/**
 * The site mark — three fanned cards, echoing what the site actually
 * trades in. Matches the "card stack" concept picked from the original
 * logo mockups (same proportions/rotation/colors, just cropped tight).
 */
export function CardStackLogo({ className = "h-14 w-14" }: { className?: string }) {
  return (
    <svg viewBox="0 0 92 100" className={className} aria-hidden="true">
      <g transform="translate(46,50)">
        <g transform="rotate(-14)">
          <rect x="-25" y="-35" width="50" height="70" rx="6" fill="#B5D4F4" stroke="#378ADD" strokeWidth="1.5" />
        </g>
        <g transform="rotate(3)">
          <rect x="-25" y="-35" width="50" height="70" rx="6" fill="#85B7EB" stroke="#185FA5" strokeWidth="1.5" />
        </g>
        <g transform="rotate(18)">
          <rect x="-25" y="-35" width="50" height="70" rx="6" fill="#E6F1FB" stroke="#0C447C" strokeWidth="1.5" />
          <circle cx="-14" cy="-22" r="3" fill="#0C447C" />
        </g>
      </g>
    </svg>
  );
}
