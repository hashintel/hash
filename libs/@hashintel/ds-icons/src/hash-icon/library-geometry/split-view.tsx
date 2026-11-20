import { FilledShape } from "../filled-shape";

export const splitViewGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M12 4v16" />
        </>
      }
    >
      <rect x="3" y="4" width="18" height="16" rx="0.5" />
    </FilledShape>
  </g>
);
