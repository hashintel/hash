import { FilledShape } from "../filled-shape";

export const circleUpGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M12 17V7m-4 4 4-4 4 4" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
