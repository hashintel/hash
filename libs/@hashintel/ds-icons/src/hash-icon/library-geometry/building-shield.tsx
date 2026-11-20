import { FilledShape } from "../filled-shape";

export const buildingShieldGeometry = (
  <g fill="none">
    <g transform="translate(-2 0) scale(.85)">
      <FilledShape
        cutout={
          <>
            <path d="M8 7h2m4 0h2M8 11h2m4 0h2M8 15h2m4 0h2M11 21v-3h2v3" />
          </>
        }
      >
        <rect x="5" y="3" width="14" height="18" rx="0.5" />
      </FilledShape>
    </g>
    <g transform="translate(11 10) scale(.5)">
      <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z" />
    </g>
  </g>
);
