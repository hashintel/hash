import { FilledShape } from "../filled-shape";

export const ballotCheckGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <g strokeWidth="calc(var(--hash-icon-stroke-width) * .8)">
            <path d="M11.5 12.5h-5v-5H9" />
            <path d="m8 9.2 1.7 1.7 3.8-4.4" />
          </g>
          <path d="M16 9h2M6.5 17h11" />
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </FilledShape>
  </g>
);
