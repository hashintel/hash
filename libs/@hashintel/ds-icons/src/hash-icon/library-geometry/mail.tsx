import { FilledShape } from "../filled-shape";

export const mailGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m3 6 9 7 9-7" />
        </>
      }
    >
      <rect x="3" y="5" width="18" height="14" rx="1" />
    </FilledShape>
  </g>
);
