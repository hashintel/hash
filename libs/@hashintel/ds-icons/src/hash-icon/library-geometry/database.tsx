import { FilledShape } from "../filled-shape";

export const databaseGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 6a9 3 0 0 0 18 0M3 12a9 3 0 0 0 18 0" />
        </>
      }
    >
      <path d="M3 6a9 3 0 0 1 18 0v12a9 3 0 0 1-18 0Z" />
    </FilledShape>
  </g>
);
