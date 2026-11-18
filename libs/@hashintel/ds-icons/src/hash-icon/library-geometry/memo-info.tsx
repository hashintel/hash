import { FilledShape } from "../filled-shape";

export const memoInfoGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M8 7h8m-4 5v5" />
          <circle cx="12" cy="10" r="0.6" fill="currentColor" stroke="none" />
        </>
      }
    >
      <rect x="4" y="3.5" width="16" height="17" rx="1" />
    </FilledShape>
  </g>
);
