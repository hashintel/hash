import { FilledShape } from "../filled-shape";

export const radioCheckedGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
