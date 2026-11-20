import { FilledShape } from "../filled-shape";

export const boxLocationGeometry = (
  <g fill="none">
    <FilledShape cutout={<path d="m2.5 7 5 2.5 5-2.5m-5 2.5v7M5 5.75l5 2.5" />}>
      <path d="m2.5 7 5-2.5 5 2.5v7l-5 2.5-5-2.5Z" />
    </FilledShape>
    <FilledShape
      cutout={
        <circle cx="18.5" cy="15" r=".8" fill="currentColor" stroke="none" />
      }
    >
      <path d="M21.5 15c0 3-3 6-3 6s-3-3-3-6a3 3 0 0 1 6 0Z" />
    </FilledShape>
  </g>
);
