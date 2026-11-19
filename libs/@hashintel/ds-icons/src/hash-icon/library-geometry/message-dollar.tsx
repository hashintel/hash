import { FilledShape } from "../filled-shape";

export const messageDollarGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <g transform="translate(5.4 4.5) scale(.55)">
            <path d="M15 7c-5-3-9 3-3 5s2 8-3 5M12 3v18" />
          </g>
        </>
      }
    >
      <path d="M3 4h18v13H10l-5 4v-4H3Z" />
    </FilledShape>
  </g>
);
