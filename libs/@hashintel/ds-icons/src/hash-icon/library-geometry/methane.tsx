import { FilledShape } from "../filled-shape";

export const methaneGeometry = (
  <g fill="none">
    <g strokeWidth="calc(var(--hash-icon-stroke-width) * .6)">
      <path d="M10.232 10.232 6.061 6.061M13.768 10.232 17.939 6.061M10.232 13.768 6.061 17.939M13.768 13.768 17.939 17.939" />
    </g>
    <FilledShape>
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="5" cy="5" r="1.5" />
      <circle cx="19" cy="5" r="1.5" />
      <circle cx="5" cy="19" r="1.5" />
      <circle cx="19" cy="19" r="1.5" />
    </FilledShape>
  </g>
);
