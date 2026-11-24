import { FilledShape } from "../filled-shape";

export const mapGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M9 3v16M15 5v16" />
        </>
      }
    >
      <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" />
    </FilledShape>
  </g>
);
