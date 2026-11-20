import { FilledShape } from "../filled-shape";

export const circlePlusGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M7 12h10m-5-5v10" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
