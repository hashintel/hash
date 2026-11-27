import { FilledShape } from "../filled-shape";

export const ghostGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <g fill="currentColor" stroke="none">
            <circle cx="9" cy="10.5" r="0.85" />
            <circle cx="15" cy="10.5" r="0.85" />
          </g>
        </>
      }
    >
      <path d="M5 21V10a7 7 0 0 1 14 0v11l-3-2-4 2-4-2Z" />
    </FilledShape>
  </g>
);
