import { FilledShape } from "../filled-shape";

export const hardDriveGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 12h18" />
          <g fill="currentColor" stroke="none">
            <circle cx="6.5" cy="16" r="1" />
            <circle cx="10.5" cy="16" r="1" />
          </g>
        </>
      }
    >
      <path d="m6 4-3 8v8h18v-8l-3-8Z" />
    </FilledShape>
  </g>
);
