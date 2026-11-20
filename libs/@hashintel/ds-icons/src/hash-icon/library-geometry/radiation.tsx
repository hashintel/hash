import { FilledShape } from "../filled-shape";

export const radiationGeometry = (
  <g fill="none">
    <FilledShape>
      <path
        transform="rotate(0 12 12)"
        d="M8.5 12H4a8 8 0 0 1 4-6.928l2.25 3.897A3.5 3.5 0 0 0 8.5 12Z"
      />
      <path
        transform="rotate(120 12 12)"
        d="M8.5 12H4a8 8 0 0 1 4-6.928l2.25 3.897A3.5 3.5 0 0 0 8.5 12Z"
      />
      <path
        transform="rotate(240 12 12)"
        d="M8.5 12H4a8 8 0 0 1 4-6.928l2.25 3.897A3.5 3.5 0 0 0 8.5 12Z"
      />
    </FilledShape>
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </g>
);
