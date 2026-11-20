import { FilledShape } from "../filled-shape";

export const boxLocationGeometry = (
  <g fill="none">
    <g transform="translate(-1 0) scale(.8)">
      <FilledShape
        cutout={
          <>
            <path d="m3 7 9 4 9-4m-9 4v10M7.5 5l9 4v5" />
          </>
        }
      >
        <path d="m3 7 9-4 9 4v10l-9 4-9-4Z" />
      </FilledShape>
    </g>
    <g transform="translate(12 10) scale(.45)">
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
