import { FilledShape } from "../filled-shape";

export const partyHornGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m5 15 4 4" />
        </>
      }
    >
      <path d="m3 21 4-11 7 7Z" />
    </FilledShape>
    <path d="m11 13 5-5m-1-5h4v4m-8-5v3m8 7h3m-7 2 3 3" />
  </g>
);
