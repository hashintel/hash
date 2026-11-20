import { FilledShape } from "../filled-shape";

export const toolboxGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 12h18M8 11v4m8-4v4" />
        </>
      }
    >
      <rect x="3" y="7" width="18" height="14" rx="1.5" />
    </FilledShape>
    <path d="M8 7V3h8v4" />
  </g>
);
