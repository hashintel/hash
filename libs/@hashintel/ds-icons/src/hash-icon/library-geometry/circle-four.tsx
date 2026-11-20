import { FilledShape } from "../filled-shape";

export const circleFourGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <g transform="translate(3 3) scale(.75)">
            <path d="M14 18V6h-2l-5 8h10" />
          </g>
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  </g>
);
