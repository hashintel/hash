import { FilledShape } from "../filled-shape";

export const buildingShieldGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <path
          d="M5.5 7h1m2 0h1m-4 3.5h1m2 0h1m-4 3.5h1m2 0h1M6 21v-3h3v3"
          strokeWidth="calc(var(--hash-icon-stroke-width) * .75)"
        />
      }
    >
      <rect x="3" y="3" width="9" height="18" rx="0.5" />
    </FilledShape>
    <FilledShape>
      <path d="m18.5 11.5 3.5 1.5v4c0 2-1.7 3.4-3.5 4.5-1.8-1.1-3.5-2.5-3.5-4.5v-4Z" />
    </FilledShape>
  </g>
);
