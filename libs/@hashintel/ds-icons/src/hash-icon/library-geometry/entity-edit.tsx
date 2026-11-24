import { FilledShape } from "../filled-shape";

export const entityEditGeometry = (
  <g fill="none">
    <g transform="translate(-1 0) scale(.8)">
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
    <path d="m13 18 5-5 3 3-5 5-4 1Z" />
  </g>
);
