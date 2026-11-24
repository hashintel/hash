import { FilledShape } from "../filled-shape";

export const megaphoneGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M8 9v6" />
        </>
      }
    >
      <path d="M3 9h5l12-5v16L8 15H3Z" />
    </FilledShape>
    <path d="M5 15l2 6h4l-2-6" />
  </g>
);
