import { FilledShape } from "../filled-shape";

export const circleThreeGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <g transform="translate(3 3) scale(.75)">
            <path d="M8 6h8l-5 5c8-1 7 10-3 6" />
          </g>
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
