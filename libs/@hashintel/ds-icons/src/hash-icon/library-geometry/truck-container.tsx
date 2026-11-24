import { FilledShape } from "../filled-shape";

export const truckContainerGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M5 7v7m3-7v7m3-7v7" />
        </>
      }
    >
      <rect x="2" y="4" width="13" height="13" rx="0.5" />
    </FilledShape>
    <path d="M15 9h4l3 4v4h-7" />
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="19" r="2" />
  </g>
);
