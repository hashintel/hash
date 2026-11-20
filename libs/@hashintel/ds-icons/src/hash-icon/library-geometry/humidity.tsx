import { FilledShape } from "../filled-shape";

export const humidityGeometry = (
  <g transform="translate(1.2 1.2) scale(.9)">
    <g fill="none">
      <FilledShape
        cutout={
          <>
            <path d="M8 16a4 4 0 0 0 4 4" />
          </>
        }
      >
        <path d="M12 2S4 11 4 15a8 8 0 0 0 16 0c0-4-8-13-8-13Z" />
      </FilledShape>
    </g>
  </g>
);
