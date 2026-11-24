import { FilledShape } from "../filled-shape";

export const filePresentationGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <path d="M9 18v-6h4a2 2 0 0 1 0 4H9" />
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
