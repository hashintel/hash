import { FilledShape } from "../filled-shape";

export const thermometerGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M12 7v10" />
        </>
      }
    >
      <path d="M9 13V5a3 3 0 0 1 6 0v8a4.5 4.5 0 1 1-6 0Z" />
    </FilledShape>
  </g>
);
