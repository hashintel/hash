import { FilledShape } from "../filled-shape";

export const magneticMediaGeometry = (
  <g transform="translate(1.2 1.2) scale(.9)">
    <g fill="none">
      <FilledShape
        cutout={
          <>
            <circle cx="6" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M5 17h8" />
          </>
        }
      >
        <rect x="2" y="7" width="14" height="12" rx="1" />
      </FilledShape>
      <path d="M16 5a7 7 0 1 1 0 14" />
      <path d="M17 9a3 3 0 0 1 0 6" />
    </g>
  </g>
);
