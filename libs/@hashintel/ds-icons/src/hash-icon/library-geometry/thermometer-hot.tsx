import { FilledShape } from "../filled-shape";

export const thermometerHotGeometry = (
  <g fill="none">
    <g transform="translate(-3 0)">
      <FilledShape cutout={<path d="M12 5v12" />}>
        <path d="M9 13V5a3 3 0 0 1 6 0v8a4.5 4.5 0 1 1-6 0Z" />
      </FilledShape>
    </g>
    <FilledShape>
      <circle cx="19" cy="6" r="1.75" />
    </FilledShape>
    <path d="M19 1.75v1m0 6.5v1M14.75 6h1m6.5 0h1M16 3l.75.75m4.5 4.5L22 9M16 9l.75-.75m4.5-4.5L22 3" />
  </g>
);
