import { FilledShape } from "../filled-shape";

export const swatchBookGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 8h6m-6 5h6" />
        </>
      }
    >
      <path d="M3 3h6v15a3 3 0 0 1-6 0Z" />
    </FilledShape>
    <path d="m9 6 4-3 4 5-8 9m2-4h10v7H7" />
  </g>
);
