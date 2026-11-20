import { FilledShape } from "../filled-shape";

export const fileImageGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <path d="m8.5 18 3-4 4 4Z" />
          <circle
            cx="9.5"
            cy="11.5"
            r="0.65"
            fill="currentColor"
            stroke="none"
          />
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
