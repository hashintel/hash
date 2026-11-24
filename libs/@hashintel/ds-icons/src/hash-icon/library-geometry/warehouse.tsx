import { FilledShape } from "../filled-shape";

export const warehouseGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M7 21V11h10v10M7 15h10M7 18h10" />
        </>
      }
    >
      <path d="m2.5 8 9.5-5 9.5 5v13h-19Z" />
    </FilledShape>
  </g>
);
