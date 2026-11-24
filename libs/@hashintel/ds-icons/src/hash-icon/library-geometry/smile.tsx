import { FilledShape } from "../filled-shape";

export const smileGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <circle cx="8.5" cy="9" r="0.75" fill="currentColor" stroke="none" />
          <circle cx="15.5" cy="9" r="0.75" fill="currentColor" stroke="none" />
          <path d="M7 14a5 5 0 0 0 10 0" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
