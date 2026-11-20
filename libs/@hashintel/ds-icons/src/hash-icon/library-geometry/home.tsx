import { FilledShape } from "../filled-shape";

export const homeGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M9 21v-8h6v8" />
        </>
      }
    >
      <path d="m3 10 9-8 9 8v11H3Z" />
    </FilledShape>
  </g>
);
