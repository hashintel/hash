import { FilledShape } from "../filled-shape";

export const fileArchiveGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <path d="M11 9h2m-2 3h2m-2 3h2m-2 3h2" />
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
