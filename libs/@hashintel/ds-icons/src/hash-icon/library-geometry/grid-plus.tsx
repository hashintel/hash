import { FilledShape } from "../filled-shape";

export const gridPlusGeometry = (
  <g fill="none">
    <FilledShape>
      <rect x="3" y="3" width="7" height="7" rx="0.5" />
      <rect x="14" y="3" width="7" height="7" rx="0.5" />
      <rect x="3" y="14" width="7" height="7" rx="0.5" />
    </FilledShape>
    <path d="M17.5 13v9M13 17.5h9" />
  </g>
);
