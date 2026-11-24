import { FilledShape } from "../filled-shape";

export const filePdfGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <path
            d="M8 18v-5h1a1.25 1.25 0 0 1 0 2.5H8M11.5 13h.5c2 0 2 5 0 5h-.5Zm4 5v-5h2m-2 2.5H17"
            strokeWidth="calc(var(--hash-icon-stroke-width) * .6)"
          />
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
