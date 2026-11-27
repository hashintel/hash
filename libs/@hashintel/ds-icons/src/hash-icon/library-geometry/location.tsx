import { FilledShape } from "../filled-shape";

export const locationGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <circle cx="12" cy="9" r="2.5" />
        </>
      }
    >
      <path d="M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 0 1 14 0Z" />
    </FilledShape>
  </g>
);
