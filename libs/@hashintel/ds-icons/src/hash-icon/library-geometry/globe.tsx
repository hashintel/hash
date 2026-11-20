import { FilledShape } from "../filled-shape";

export const globeGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z" />
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
