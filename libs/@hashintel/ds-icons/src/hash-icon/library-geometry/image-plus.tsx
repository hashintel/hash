import { FilledShape } from "../filled-shape";

export const imagePlusGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m5 18 3-4 6 5" />
          <circle
            cx="6.5"
            cy="10.5"
            r="0.8"
            fill="currentColor"
            stroke="none"
          />
        </>
      }
    >
      <path d="M3 7h14v14H3Z" />
    </FilledShape>
    <path d="M17.5 4h5m-2.5-2.5v5" />
  </g>
);
