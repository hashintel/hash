import { FilledShape } from "../filled-shape";

export const compassGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m15 7-2 6-6 4 4-7Z" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
