import { FilledShape } from "../filled-shape";

export const mapPinGeometry = (
  <g fill="none">
    <path d="M11 8.7 9 8l-6 2v11l6-2 5 2 7-2v-6M9 8v11m5-3v5" />
    <FilledShape
      cutout={
        <circle cx="17" cy="6.5" r="1" fill="currentColor" stroke="none" />
      }
    >
      <path d="M20.5 6.5c0 3.2-3.5 6.5-3.5 6.5s-3.5-3.3-3.5-6.5a3.5 3.5 0 0 1 7 0Z" />
    </FilledShape>
  </g>
);
