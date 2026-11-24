import { FilledShape } from "../filled-shape";

export const sendGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M7 12h15" />
        </>
      }
    >
      <path d="m3 3 19 9-19 9 4-9Z" />
    </FilledShape>
  </g>
);
