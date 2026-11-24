import { FilledShape } from "../filled-shape";

export const shopGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M9 21v-7h6v7" />
        </>
      }
    >
      <path d="M4 10v11h16V10" />
    </FilledShape>
    <path d="M4 3h16l2 7c-2 3-4 0-4 0-2 3-4 0-4 0-2 3-4 0-4 0-2 3-4 0-4 0-2 3-4 0-4 0Z" />
  </g>
);
