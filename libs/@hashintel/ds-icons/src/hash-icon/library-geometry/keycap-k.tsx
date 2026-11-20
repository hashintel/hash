import { FilledShape } from "../filled-shape";

export const keycapKGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M8 7v10m0-5 7-5m-4 3 5 7" />
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </FilledShape>
  </g>
);
