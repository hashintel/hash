import { FilledShape } from "../filled-shape";

export const mapPinGeometry = (
  <g fill="none">
    <path d="m3 10 6-2 5 2v11l-5-2-6 2Zm6-2v11m5-9 7-2v13l-7-2" />
    <g transform="translate(10 1) scale(.5)">
      <FilledShape
        cutout={
          <>
            <circle cx="12" cy="9" r="2.5" />
          </>
        }
      >
        <path d="M19 9c0 6-7 12-7 12S5 15 5 9a7 7 0 0 1 14 0Z" />
      </FilledShape>
    </g>
  </g>
);
