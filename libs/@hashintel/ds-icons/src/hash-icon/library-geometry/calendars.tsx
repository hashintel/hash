import { FilledShape } from "../filled-shape";

export const calendarsGeometry = (
  <g fill="none">
    <path d="M3 16V3h13" />
    <FilledShape
      cutout={
        <>
          <path d="M6 11h15M10 5v4m7-4v4m-7 6h3m3 0h2" />
        </>
      }
    >
      <rect x="6" y="7" width="15" height="14" rx="1" />
    </FilledShape>
  </g>
);
