import { FilledShape } from "../filled-shape";

export const circleTagGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M7 7h5l5 5-5 5-5-5Z" />
          <circle cx="10" cy="10" r="0.65" fill="currentColor" stroke="none" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
