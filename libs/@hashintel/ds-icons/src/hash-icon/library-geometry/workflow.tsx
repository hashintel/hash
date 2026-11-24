import { FilledShape } from "../filled-shape";

export const workflowGeometry = (
  <g fill="none">
    <FilledShape>
      <rect x="2" y="3" width="7" height="5" rx="0.5" />
      <rect x="15" y="3" width="7" height="5" rx="0.5" />
      <rect x="9" y="16" width="7" height="6" rx="0.5" />
    </FilledShape>
    <path d="M9 5.5h6M18.5 8v4H12v4" />
  </g>
);
