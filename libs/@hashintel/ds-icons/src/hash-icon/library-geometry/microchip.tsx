import { FilledShape } from "../filled-shape";

export const microchipGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <rect x="9" y="9" width="6" height="6" rx="0.5" />
        </>
      }
    >
      <rect x="6" y="6" width="12" height="12" rx="1" />
      <path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" />
    </FilledShape>
  </g>
);
