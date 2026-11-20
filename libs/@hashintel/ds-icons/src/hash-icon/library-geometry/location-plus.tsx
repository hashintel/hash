import { FilledShape } from "../filled-shape";

export const locationPlusGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M9 9h6m-3-3v6" />
        </>
      }
    >
      <path d="M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 0 1 14 0Z" />
    </FilledShape>
  </g>
);
