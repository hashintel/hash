import { FilledShape } from "../filled-shape";

export const tagGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <circle cx="7.5" cy="7.5" r="1.5" />
        </>
      }
    >
      <path d="M3 3h8l10 10-8 8L3 11Z" />
    </FilledShape>
  </g>
);
