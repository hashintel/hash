import { FilledShape } from "../filled-shape";

export const briefcaseGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 12h18M10 12v3h4v-3" />
        </>
      }
    >
      <rect x="3" y="7" width="18" height="14" rx="1" />
    </FilledShape>
    <path d="M8 7V3h8v4" />
  </g>
);
