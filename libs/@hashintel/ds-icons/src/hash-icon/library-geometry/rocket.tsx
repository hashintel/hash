import { FilledShape } from "../filled-shape";

export const rocketGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <circle cx="15" cy="9" r="2" />
        </>
      }
    >
      <path d="M8 16C3 8 12 3 21 3c0 9-5 18-13 13Z" />
    </FilledShape>
    <path d="M7 8H3v9l5-1m8 1v4H7l1-5M3 21l3-3" />
  </g>
);
