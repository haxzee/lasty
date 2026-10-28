import { useId } from "react";

const MARK = "M300 288 L386 288 L556 658 L724 658 L724 736 L506 736 Z";

/** The app mark. `animated` draws the stroke in and sweeps a sheen across the tile once. */
export function AppIcon({ size = 64, animated = false }: { size?: number; animated?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="100 100 824 824" className="shrink-0" shapeRendering="geometricPrecision" aria-hidden>
      {animated && (
        <defs>
          <mask id={`${id}-draw`} maskUnits="userSpaceOnUse" x="100" y="100" width="824" height="824">
            <path
              d="M343 230 L531 697 L790 697"
              fill="none"
              stroke="#fff"
              strokeWidth="150"
              pathLength={1}
              strokeDasharray="1"
              className="motion"
              style={{ animation: "draw 1100ms 250ms cubic-bezier(.65,0,.25,1) both" }}
            />
          </mask>
          <clipPath id={`${id}-tile`}>
            <rect x="100" y="100" width="824" height="824" rx="186" />
          </clipPath>
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.18" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      <rect x="100" y="100" width="824" height="824" rx="186" fill="#000" />
      <path fill="#fff" d={MARK} mask={animated ? `url(#${id}-draw)` : undefined} />
      {animated && (
        <g clipPath={`url(#${id}-tile)`}>
          <rect
            x="100"
            y="60"
            width="260"
            height="904"
            fill={`url(#${id}-sheen)`}
            className="motion motion-hide"
            style={{ transformBox: "fill-box", transformOrigin: "center", animation: "shine 1300ms 1250ms cubic-bezier(.4,0,.2,1) both" }}
          />
        </g>
      )}
    </svg>
  );
}
