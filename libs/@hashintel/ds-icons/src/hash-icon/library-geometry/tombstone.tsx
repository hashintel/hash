import { FilledShape } from "../filled-shape";

export const tombstoneGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M9 9h6m-3-3v9" />
        </>
      }
    >
      <path d="M5 21V9a7 7 0 0 1 14 0v12Z" />
    </FilledShape>
  </g>
);
