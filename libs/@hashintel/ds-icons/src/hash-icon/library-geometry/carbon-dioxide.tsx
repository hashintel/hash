import { FilledShape } from "../filled-shape";

export const carbonDioxideGeometry = (
  <g fill="none">
    <g strokeWidth="calc(var(--hash-icon-stroke-width) * .6)">
      <path d="M9.25 13.2 6.35 13.2M9.25 10.8 6.35 10.8M14.75 10.8 17.65 10.8M14.75 13.2 17.65 13.2" />
    </g>
    <FilledShape>
      <circle cx="12" cy="12" r="3" />
      <circle cx="4.75" cy="12" r="2" />
      <circle cx="19.25" cy="12" r="2" />
    </FilledShape>
  </g>
);
