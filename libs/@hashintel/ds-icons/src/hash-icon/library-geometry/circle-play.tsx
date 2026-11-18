import { FilledShape } from "../filled-shape";

export const circlePlayGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m10 8 6 4-6 4Z" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
