import { FilledShape } from "../filled-shape";

export const squarePlusGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M7 12h10m-5-5v10" />
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="0.5" />
    </FilledShape>
  </g>
);
