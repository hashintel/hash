import { FilledShape } from "../filled-shape";

export const booksGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 8h8m-8 8h8m3-7 4-1m-2 8 4-1" />
        </>
      }
    >
      <rect x="3" y="4" width="4" height="16" rx="0.5" />
      <rect x="7" y="4" width="4" height="16" rx="0.5" />
      <path d="m13 5 4-1 4 15-4 1Z" />
    </FilledShape>
  </g>
);
