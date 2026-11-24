import { FilledShape } from "../filled-shape";

export const distributeVerticalGeometry = (
  <g fill="none">
    <g transform="rotate(90 12 12)">
      <path d="M3 3v18M21 3v18" />
      <FilledShape>
        <rect x="7" y="7" width="3" height="10" rx="0.3" />
        <rect x="14" y="4" width="3" height="16" rx="0.3" />
      </FilledShape>
    </g>
  </g>
);
