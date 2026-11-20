import { FilledShape } from "../filled-shape";

export const pizzaGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 8a20 20 0 0 1 13 13" />
          <circle cx="7" cy="14" r="1.5" />
          <circle cx="9" cy="19" r="1" />
        </>
      }
    >
      <path d="M3 4a25 25 0 0 1 17 17L3 21Z" />
    </FilledShape>
  </g>
);
