import { FilledShape } from "../filled-shape";

export const gemGeometry = (
  <g transform="translate(1.2 1.2) scale(.9)">
    <g fill="none">
      <FilledShape
        cutout={
          <>
            <path d="M2 10h20M7 3l-1 7 6 12 6-12-1-7M6 10l6-7 6 7" />
          </>
        }
      >
        <path d="M7 3h10l5 7-10 12L2 10Z" />
      </FilledShape>
    </g>
  </g>
);
