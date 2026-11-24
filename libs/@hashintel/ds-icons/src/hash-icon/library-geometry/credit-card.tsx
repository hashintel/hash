import { FilledShape } from "../filled-shape";

export const creditCardGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 10h18M6 15h5" />
        </>
      }
    >
      <rect x="3" y="5" width="18" height="14" rx="1" />
    </FilledShape>
  </g>
);
