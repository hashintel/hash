import { FilledShape } from "../filled-shape";

export const helpGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M9 8.5c0-4 7-4 6 0-.5 2-3 2-3 4" />
          <circle
            cx="12"
            cy="16.5"
            r="0.75"
            fill="currentColor"
            stroke="none"
          />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
