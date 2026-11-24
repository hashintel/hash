import { FilledShape } from "../filled-shape";

export const batteryLevelGeometry = (
  <g fill="none">
    <path d="M22 10v4" />
    <FilledShape
      cutout={
        <>
          <path d="M6.5 10v4m4.5-4v4m4.5-4v4" />
        </>
      }
    >
      <path d="M3 7h16v10H3Z" />
    </FilledShape>
  </g>
);
