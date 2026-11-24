import { FilledShape } from "../filled-shape";

export const circleTwoGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <g transform="translate(3 3) scale(.75)">
            <path d="M8 8c0-5 9-5 8 0 0 2-8 5-8 9h8" />
          </g>
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
