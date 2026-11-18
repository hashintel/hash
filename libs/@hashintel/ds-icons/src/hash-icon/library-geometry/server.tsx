import { FilledShape } from "../filled-shape";

export const serverGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 9h18M3 15h18M6 6h1m-1 6h1m-1 6h1" />
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </FilledShape>
  </g>
);
