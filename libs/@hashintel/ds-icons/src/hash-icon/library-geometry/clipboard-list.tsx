import { FilledShape } from "../filled-shape";

export const clipboardListGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <rect x="9" y="3" width="6" height="4" rx="0.5" />
          <path d="M8 11h1m2 0h5m-8 4h1m2 0h5" />
        </>
      }
    >
      <rect x="5" y="5" width="14" height="16" rx="1" />
    </FilledShape>
    <path d="M9 5V3h6v2" />
  </g>
);
