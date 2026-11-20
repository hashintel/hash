import { FilledShape } from "../filled-shape";

export const fileVideoCameraGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M14 3v5h5M8 12h6v6H8Zm6 2 3-2v6l-3-2" />
        </>
      }
    >
      <path d="M5 3h9l5 5v13H5Z" />
    </FilledShape>
  </g>
);
