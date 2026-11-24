import { FilledShape } from "../filled-shape";

export const receiptGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M8 7h8m-8 4h8m-8 4h5" />
        </>
      }
    >
      <path d="M5 3h14v18l-3-2-4 2-4-2-3 2Z" />
    </FilledShape>
  </g>
);
