import { FilledShape } from "../filled-shape";

export const packGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3 7h18M8 3l4 4 4-4m-7 7h6" />
        </>
      }
    >
      <path d="m3 7 5-4h8l5 4v14H3Z" />
    </FilledShape>
  </g>
);
