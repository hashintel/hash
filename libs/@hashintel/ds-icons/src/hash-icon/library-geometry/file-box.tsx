import { FilledShape } from "../filled-shape";

export const fileBoxGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <path
            strokeWidth="calc(var(--hash-icon-stroke-width) * .6)"
            d="m9 12 3-1.5 3 1.5v4L12 18l-3-2Zm0 0 3 1.5 3-1.5m-3 1.5V18"
          />
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
