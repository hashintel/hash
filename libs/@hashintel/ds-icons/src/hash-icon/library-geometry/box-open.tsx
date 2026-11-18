import { FilledShape } from "../filled-shape";

export const boxOpenGeometry = (
  <g fill="none" transform="translate(1.2 1.2) scale(.9)">
    <FilledShape
      cutout={
        <>
          <path d="M12 9v13" />
        </>
      }
    >
      <path d="M5 11v8l7 3 7-3v-8M5 6l7 3 7-3-7-3Z" />
    </FilledShape>
    <path d="m5 6-3 4 7 3 3-4 3 4 7-3-3-4" />
  </g>
);
