import { FilledShape } from "../filled-shape";

export const squareMinusGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M8 12h8" />
        </>
      }
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
    </FilledShape>
  </g>
);
