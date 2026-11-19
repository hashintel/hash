import { FilledShape } from "../filled-shape";

export const fileAudioGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <path d="M12 17v-5l4-1v5" />
          <circle cx="10.5" cy="17" r="1.5" />
          <circle cx="14.5" cy="16" r="1.5" />
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
