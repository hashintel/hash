import { FilledShape } from "../filled-shape";

export const filesGeometry = (
  <g fill="none">
    <path d="M3 17V3h12" />
    <FilledShape
      cutout={
        <>
          <path d="M16 7v5h5" />
        </>
      }
    >
      <path d="M7 7h9l5 5v9H7Z" />
    </FilledShape>
  </g>
);
