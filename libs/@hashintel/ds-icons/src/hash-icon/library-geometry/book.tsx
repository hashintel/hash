import { FilledShape } from "../filled-shape";

export const bookGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M20 17H6a2 2 0 0 0 0 4M8 7h8m-8 4h6" />
        </>
      }
    >
      <path d="M6 3h14v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
    </FilledShape>
  </g>
);
