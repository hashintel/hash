import { FilledShape } from "../filled-shape";

export const cctvCameraGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m16 6 3 4" />
        </>
      }
    >
      <path d="M3 4h15l4 5-9 6-9-5Z" />
    </FilledShape>
    <path d="m8 13 2 5H3v4" />
  </g>
);
