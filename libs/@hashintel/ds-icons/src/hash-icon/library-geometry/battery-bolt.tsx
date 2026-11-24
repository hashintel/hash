import { FilledShape } from "../filled-shape";

export const batteryBoltGeometry = (
  <g fill="none">
    <path d="M22 10v4" />
    <FilledShape
      cutout={
        <>
          <path
            strokeWidth="calc(var(--hash-icon-stroke-width) * .65)"
            d="m12 8.5-3 3.5h4l-3 3.5"
          />
        </>
      }
    >
      <path d="M3 7h16v10H3Z" />
    </FilledShape>
  </g>
);
