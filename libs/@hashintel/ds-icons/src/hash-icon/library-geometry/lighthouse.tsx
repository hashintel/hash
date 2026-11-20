import { FilledShape } from "../filled-shape";

export const lighthouseGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M7 14h10" />
        </>
      }
    >
      <path d="m8 8-3 13h14L16 8Z" />
    </FilledShape>
    <path d="M8 8V4l4-2 4 2v4ZM2 5h3m14 0h3" />
  </g>
);
