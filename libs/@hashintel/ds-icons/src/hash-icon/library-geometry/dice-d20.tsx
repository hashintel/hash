import { FilledShape } from "../filled-shape";

export const diceD20Geometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m12 2 5 15H7ZM3 7h6m6 0h6M3 17h4l5 5 5-5h4" />
        </>
      }
    >
      <path d="m12 2 9 5v10l-9 5-9-5V7Z" />
    </FilledShape>
  </g>
);
