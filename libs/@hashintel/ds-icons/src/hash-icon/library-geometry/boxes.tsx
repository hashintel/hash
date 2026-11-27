import { FilledShape } from "../filled-shape";

export const boxesGeometry = (
  <g transform="translate(1.2 1.2) scale(.9)">
    <g fill="none">
      <FilledShape
        cutout={
          <>
            <path d="m7 3 5 2 5-2m-5 2v6m-10 1 5 2 5-2m-5 2v7m5-9 5 2 5-2m-5 2v7" />
          </>
        }
      >
        <path d="m7 3 5-2 5 2v6l-5 2-5-2Zm-5 9 5-2 5 2v7l-5 2-5-2Zm10 0 5-2 5 2v7l-5 2-5-2Z" />
      </FilledShape>
    </g>
  </g>
);
