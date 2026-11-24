import { FilledShape } from "../filled-shape";

export const badgeCheckGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m8 12 2.5 2.5 5.5-6" />
        </>
      }
    >
      <path d="m12 2 3 2 3.5.5.5 3.5 2 4-2 3-.5 3.5-3.5.5-3 2-3-2-3.5-.5-.5-3.5-2-3 2-4 .5-3.5L9 4Z" />
    </FilledShape>
  </g>
);
