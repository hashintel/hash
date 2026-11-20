import { FilledShape } from "../filled-shape";

export const buildingSearchGeometry = (
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
    <circle cx="17" cy="16" r="3.5" />
    <path d="m19.5 18.5 3 3" />
  </g>
);
