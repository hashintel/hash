import { FilledShape } from "../filled-shape";

export const squareCloseGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m8.5 8.5 7 7m0-7-7 7" />
        </>
      }
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
    </FilledShape>
  </g>
);
