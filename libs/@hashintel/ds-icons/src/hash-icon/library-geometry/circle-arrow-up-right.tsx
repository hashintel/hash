import { FilledShape } from "../filled-shape";

export const circleArrowUpRightGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m8 16 8-8M8 8h8v8" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
