import { FilledShape } from "../filled-shape";

export const locationCheckGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m8.5 9 2.5 2.5 4.5-5" />
        </>
      }
    >
      <path d="M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 0 1 14 0Z" />
    </FilledShape>
  </g>
);
