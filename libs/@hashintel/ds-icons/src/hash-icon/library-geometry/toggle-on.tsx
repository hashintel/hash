import { FilledShape } from "../filled-shape";

export const toggleOnGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <circle cx="15.5" cy="12" r="3.5" />
        </>
      }
    >
      <rect x="2.5" y="6" width="19" height="12" rx="6" />
    </FilledShape>
  </g>
);
