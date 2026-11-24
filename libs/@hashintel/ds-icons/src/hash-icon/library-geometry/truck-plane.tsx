import { FilledShape } from "../filled-shape";

export const truckPlaneGeometry = (
  <g fill="none">
    <path d="M2 12h11v7H2Zm11 3h4l3 4h-7" />
    <circle cx="5" cy="21" r="1.5" />
    <circle cx="16" cy="21" r="1.5" />
    <g transform="translate(16 6) scale(.5) rotate(45) translate(-12 -12)">
      <g strokeWidth="calc(var(--hash-icon-stroke-width) * 1.4)">
        <FilledShape>
          <path d="M12 2c1 0 1.5 1 1.5 2v5l8 5v3l-8-3v5l3 2H7.5l3-2v-5l-8 3v-3l8-5V4c0-1 .5-2 1.5-2Z" />
        </FilledShape>
      </g>
    </g>
  </g>
);
