import { FilledShape } from "../filled-shape";

export const keyGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <circle cx="8" cy="8" r="1" />
        </>
      }
    >
      <circle cx="8" cy="8" r="5" />
    </FilledShape>
    <path d="m11.5 11.5 9 9m-3-3 3-3m-6 0 3-3" />
  </g>
);
