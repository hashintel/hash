import { FilledShape } from "../filled-shape";

export const archiveGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M9 12h6" />
        </>
      }
    >
      <rect x="4" y="8" width="16" height="13" rx="1" />
    </FilledShape>
    <rect x="3" y="3" width="18" height="5" rx="0.5" />
  </g>
);
