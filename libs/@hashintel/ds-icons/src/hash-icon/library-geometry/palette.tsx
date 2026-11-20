import { FilledShape } from "../filled-shape";

export const paletteGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <circle cx="7" cy="8" r="1" />
          <circle cx="12" cy="6" r="1" />
          <circle cx="17" cy="8" r="1" />
          <circle cx="6" cy="13" r="1" />
        </>
      }
    >
      <path d="M12 3a9 9 0 1 0 0 18c4 0-1-5 3-5h3c6 0 4-13-6-13Z" />
    </FilledShape>
  </g>
);
