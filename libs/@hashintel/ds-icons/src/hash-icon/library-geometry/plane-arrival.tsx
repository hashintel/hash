import { FilledShape } from "../filled-shape";

export const planeArrivalGeometry = (
  <g fill="none">
    <g transform="translate(12 11) scale(.8) rotate(120) translate(-12 -12)">
      <g strokeWidth="calc(var(--hash-icon-stroke-width) * 1.25)">
        <FilledShape>
          <path d="M12 2c1 0 1.5 1 1.5 2v5l8 5v3l-8-3v5l3 2H7.5l3-2v-5l-8 3v-3l8-5V4c0-1 .5-2 1.5-2Z" />
        </FilledShape>
      </g>
    </g>
    <path d="M3 21h18" />
  </g>
);
