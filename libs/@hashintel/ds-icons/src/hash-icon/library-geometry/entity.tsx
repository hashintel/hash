import { FilledShape } from "../filled-shape";

export const entityGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m3 8 9 5 9-5m-9 5v9" />
        </>
      }
    >
      <path d="m12 3 9 5v9l-9 5-9-5V8Z" />
    </FilledShape>
  </g>
);
