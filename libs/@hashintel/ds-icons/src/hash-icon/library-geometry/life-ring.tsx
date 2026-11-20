import { FilledShape } from "../filled-shape";

export const lifeRingGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="m5.5 5.5 3.7 3.7m5.6 5.6 3.7 3.7M5.5 18.5l3.7-3.7m5.6-5.6 3.7-3.7" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
