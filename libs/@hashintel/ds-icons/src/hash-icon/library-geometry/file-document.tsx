import { FilledShape } from "../filled-shape";

export const fileDocumentGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <path d="M8.5 12.5 10 18l2-4 2 4 1.5-5.5" />
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
