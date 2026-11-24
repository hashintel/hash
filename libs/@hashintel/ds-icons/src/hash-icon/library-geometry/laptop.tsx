import { FilledShape } from "../filled-shape";

export const laptopGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M5 16h14" />
        </>
      }
    >
      <path d="M5 4h14v12l3 4H2l3-4Z" />
    </FilledShape>
  </g>
);
