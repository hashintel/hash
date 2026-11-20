import { FilledShape } from "../filled-shape";

export const alignBottomGeometry = (
  <g fill="none">
    <g transform="rotate(-90 12 12)">
      <path d="M3 3v18" />
      <FilledShape>
        <rect x="7" y="5" width="14" height="5" rx="0.5" />
        <rect x="7" y="14" width="9" height="5" rx="0.5" />
      </FilledShape>
    </g>
  </g>
);
