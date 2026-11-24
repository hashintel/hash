import { FilledShape } from "../filled-shape";

export const coinsGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 6a6 3 0 0 0 12 0M3 11a6 3 0 0 0 12 0" />
        </>
      }
    >
      <path d="M3 6a6 3 0 0 1 12 0v11a6 3 0 0 1-12 0Z" />
    </FilledShape>
    <path d="M17 11c5 0 5 9 0 9" />
  </g>
);
