import { FilledShape } from "../filled-shape";

export const alignCenterVerticalGeometry = (
  <g fill="none">
    <g transform="rotate(90 12 12)">
      <path d="M12 2v20" />
      <FilledShape>
        <rect x="4" y="5" width="16" height="5" rx="0.5" />
        <rect x="7" y="14" width="10" height="5" rx="0.5" />
      </FilledShape>
    </g>
  </g>
);
