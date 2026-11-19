import { FilledShape } from "../filled-shape";

export const cityGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M8 9v12M17 12v9M11 7h3m-3 4h3m-3 4h3M4 13h2m-2 4h2m13-1h1" />
        </>
      }
    >
      <path d="M2 21V9h6V3h9v9h5v9Z" />
    </FilledShape>
  </g>
);
