import { FilledShape } from "../filled-shape";

export const noteStickyGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M15 20v-5h5" />
        </>
      }
    >
      <path d="M4 4h16v11l-5 5H4Z" />
    </FilledShape>
  </g>
);
