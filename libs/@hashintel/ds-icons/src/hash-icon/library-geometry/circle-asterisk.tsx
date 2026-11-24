import { FilledShape } from "../filled-shape";

export const circleAsteriskGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M12 7v10m-4.3-7.5 8.6 5m-8.6 0 8.6-5" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
