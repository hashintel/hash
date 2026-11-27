import { FilledShape } from "../filled-shape";

export const shieldCheckGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m8 12 2.5 2.5 5.5-6" />
        </>
      }
    >
      <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z" />
    </FilledShape>
  </g>
);
