import { FilledShape } from "../filled-shape";

export const cookieGeometry = (
  <g transform="translate(1.2 1.2) scale(.9)">
    <g fill="none">
      <FilledShape
        cutout={
          <>
            <circle cx="8" cy="8" r="1" />
            <circle cx="7" cy="14" r="1" />
            <circle cx="13" cy="16" r="1" />
            <circle cx="13" cy="10" r="1" />
          </>
        }
      >
        <path d="M18 3a5 5 0 0 0 3 8A9 9 0 1 1 18 3Z" />
      </FilledShape>
    </g>
  </g>
);
