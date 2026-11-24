import { FilledShape } from "../filled-shape";

export const entityPlusGeometry = (
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
    <path d="M17 13v9m-4.5-4.5h9" />
  </g>
);
