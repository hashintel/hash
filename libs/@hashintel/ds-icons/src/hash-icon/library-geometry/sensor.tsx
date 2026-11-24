import { FilledShape } from "../filled-shape";

export const sensorGeometry = (
  <g fill="none">
    <path d="M10 17v4m4-4v4m-5 0h6" />
    <FilledShape
      cutout={
        <>
          <path d="M7 7h10" />
          <circle
            cx="12"
            cy="12"
            r="1.5"
            fill="currentColor"
            stroke="none"
            data-icon-detail="dot"
          />
        </>
      }
    >
      <path d="M9 3h6l2 4v10H7V7Z" />
    </FilledShape>
  </g>
);
