import { FilledShape } from "../filled-shape";

export const notePlusGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M15 20v-5h5M8 10h7m-3.5-3.5v7" />
        </>
      }
    >
      <path d="M4 4h16v11l-5 5H4Z" />
    </FilledShape>
  </g>
);
