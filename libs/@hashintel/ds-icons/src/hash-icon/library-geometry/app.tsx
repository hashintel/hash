import { FilledShape } from "../filled-shape";

export const appGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M8 8h8v8H8Z" />
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
    </FilledShape>
  </g>
);
