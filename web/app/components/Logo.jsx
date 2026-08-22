/**
 * Brand mark: a rising line with an arrow head — "Investor".
 * Inline SVG so it is crisp at any size and inherits currentColor
 * (white on the gradient header, brand colour elsewhere).
 */
export function LogoMark({ size = 22, className = "" }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 24 L12.5 16 L18 20.5 L27 9" />
      <path d="M20.5 9 H27 V15.5" />
      <path d="M5 28 H27" strokeOpacity="0.45" strokeWidth="2.4" />
    </svg>
  );
}

export default function Logo({ tagline = "IPO Tracker" }) {
  return (
    <>
      <span className="brand-mark">
        <LogoMark />
      </span>
      <span className="brand-text">
        <span className="brand-name">Investor</span>
        <span className="brand-tag">{tagline}</span>
      </span>
    </>
  );
}
