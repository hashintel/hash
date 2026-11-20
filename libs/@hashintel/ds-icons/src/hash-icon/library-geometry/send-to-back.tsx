import { FilledShape } from "../filled-shape";

export const sendToBackGeometry = (
  <g fill="none">
    <FilledShape>
      <rect x="3" y="9" width="12" height="12" rx="0.5" />
    </FilledShape>
    <path d="M6 9V6h12v12h-3M9 6V3h12v18h-3" />
  </g>
);
