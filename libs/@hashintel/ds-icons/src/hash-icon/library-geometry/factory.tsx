import { FilledShape } from "../filled-shape";

export const factoryGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M6 16h2m4 0h2m4 0h1" />
        </>
      }
    >
      <path d="M3 21V10l6-4v6l6-4v5h6v8Z" />
    </FilledShape>
    <path d="M17 13V3h4v10" />
  </g>
);
