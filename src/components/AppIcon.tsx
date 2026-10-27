export function AppIcon({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="100 100 824 824" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id="lasty-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3b40" />
          <stop offset="1" stopColor="#0e0e11" />
        </linearGradient>
        <linearGradient id="lasty-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.18" />
        </linearGradient>
        <linearGradient id="lasty-glyph" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#d4d4da" />
        </linearGradient>
      </defs>
      <rect x="100" y="100" width="824" height="824" rx="186" fill="url(#lasty-body)" />
      <rect x="102" y="102" width="820" height="820" rx="184" fill="none" stroke="url(#lasty-rim)" strokeWidth="4" />
      <g fill="none" stroke="url(#lasty-glyph)" strokeWidth="66" strokeLinecap="round" strokeLinejoin="round">
        <path d="M318 330 L488 694" />
        <path d="M572 330 V694 H712" />
      </g>
    </svg>
  );
}
