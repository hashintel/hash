import { FilledShape } from "../filled-shape";

export const calculatorGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <rect x="8" y="6" width="8" height="4" rx="0.5" />
          <path d="M8 14h2m4 0h2m-8 4h2m4 0h2" />
        </>
      }
    >
      <rect x="5" y="2.5" width="14" height="19" rx="1" />
    </FilledShape>
  </g>
);
