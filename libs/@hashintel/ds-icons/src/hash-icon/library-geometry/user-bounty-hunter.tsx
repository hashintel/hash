import { FilledShape } from "../filled-shape";

export const userBountyHunterGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M5 10h14m-11 3h8M12 3v7" />
        </>
      }
    >
      <path d="M5 11V9a7 7 0 0 1 14 0v2l-2 7H7Z" />
    </FilledShape>
    <path d="M3 22v-1a4 4 0 0 1 4-3h10a4 4 0 0 1 4 3v1" />
  </g>
);
