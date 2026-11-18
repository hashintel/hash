import { FilledShape } from "../filled-shape";

export const timelineArrowGeometry = (
  <g fill="none">
    <path d="M2 5h20m-3-3 3 3-3 3M6 5v6m6-6v10m6-10v14" />
    <FilledShape>
      <rect x="3" y="11" width="6" height="4" rx="0.5" />
      <rect x="9" y="15" width="6" height="4" rx="0.5" />
      <rect x="15" y="19" width="6" height="3" rx="0.5" />
    </FilledShape>
  </g>
);
