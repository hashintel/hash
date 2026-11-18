import { FilledShape } from "../filled-shape";

export const circleArrowRightGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M7 12h10m-4-4 4 4-4 4" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
