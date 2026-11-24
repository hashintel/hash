import { FilledShape } from "../filled-shape";

export const scannerGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M16 17h2" />
        </>
      }
    >
      <path d="M3 14h18v7H3Z" />
    </FilledShape>
    <path d="M3 14 17 3l4 3" />
  </g>
);
