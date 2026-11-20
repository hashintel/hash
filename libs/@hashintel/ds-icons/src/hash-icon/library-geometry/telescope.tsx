import { FilledShape } from "../filled-shape";

export const telescopeGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m14 5 3 6" />
        </>
      }
    >
      <path d="m3 10 15-7 3 6-15 7Z" />
    </FilledShape>
    <path d="M12 13v5m-5 4 5-4 5 4" />
  </g>
);
