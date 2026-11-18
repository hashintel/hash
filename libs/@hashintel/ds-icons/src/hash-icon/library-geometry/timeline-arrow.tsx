import { FilledShape } from "../filled-shape";

export const timelineArrowGeometry = (
  <g fill="none">
    <path d="M2 5h20m-3-3 3 3-3 3M6 5v5m6-5v9m6-9v13" />
    <FilledShape>
      <rect x="3" y="10" width="6" height="4" rx="0.5" />
      <rect x="9" y="14" width="6" height="4" rx="0.5" />
      <rect x="15" y="18" width="6" height="4" rx="0.5" />
    </FilledShape>
  </g>
);
