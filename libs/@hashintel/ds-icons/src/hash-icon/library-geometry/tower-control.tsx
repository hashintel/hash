import { FilledShape } from "../filled-shape";

export const towerControlGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M5 7h14M8 11h8M12 3v4M8 17h8" />
        </>
      }
    >
      <path d="M8 21V11L5 7V3h14v4l-3 4v10Z" />
    </FilledShape>
  </g>
);
