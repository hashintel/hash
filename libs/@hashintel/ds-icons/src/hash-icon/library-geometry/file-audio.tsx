import { FilledShape } from "../filled-shape";

export const fileAudioGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <g data-icon-detail="file-notes">
            <path
              d="M11.75 16.75v-4.5l4-1v4.5"
              strokeWidth="calc(var(--hash-icon-stroke-width) * .75)"
            />
            <g fill="currentColor" stroke="none">
              <ellipse cx="10.5" cy="16.75" rx="1.25" ry="1" />
              <ellipse cx="14.5" cy="15.75" rx="1.25" ry="1" />
            </g>
          </g>
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
