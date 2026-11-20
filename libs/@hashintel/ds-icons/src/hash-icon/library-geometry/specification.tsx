import { FilledShape } from "../filled-shape";

export const specificationGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M8 7h8m-8 4h8m-8 4h3m2 2 2 2 3-4" />
        </>
      }
    >
      <rect x="4" y="3" width="16" height="18" rx="0.5" />
    </FilledShape>
  </g>
);
