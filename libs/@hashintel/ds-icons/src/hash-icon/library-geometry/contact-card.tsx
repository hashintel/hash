import { FilledShape } from "../filled-shape";

export const contactCardGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <g strokeWidth="calc(var(--hash-icon-stroke-width) * .7)">
            <circle cx="8.5" cy="9" r="2" />
            <path d="M5.5 17v-1a3 3 0 0 1 6 0v1m3-9h3.5m-3.5 4h3.5m-3.5 4h3.5" />
          </g>
        </>
      }
    >
      <path d="M3 4h18v16H3Z" />
    </FilledShape>
  </g>
);
