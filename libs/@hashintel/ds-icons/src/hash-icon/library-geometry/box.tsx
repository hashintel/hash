import { FilledShape } from "../filled-shape";

export const boxGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m3 7 9 4 9-4m-9 4v10M7.5 5l9 4v5" />
        </>
      }
    >
      <path d="m3 7 9-4 9 4v10l-9 4-9-4Z" />
    </FilledShape>
  </g>
);
