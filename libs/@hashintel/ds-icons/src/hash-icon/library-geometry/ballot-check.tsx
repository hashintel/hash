import { FilledShape } from "../filled-shape";

export const ballotCheckGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <rect x="6" y="7" width="6" height="6" rx="0.3" />
          <path d="m7.5 9.5 1.5 1.5 3-4M15 9h3M6 17h12" />
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </FilledShape>
  </g>
);
