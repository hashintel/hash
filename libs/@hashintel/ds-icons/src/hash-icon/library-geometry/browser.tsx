import { FilledShape } from "../filled-shape";

export const browserGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 8h18M6 5.5h1m2 0h1" />
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </FilledShape>
  </g>
);
