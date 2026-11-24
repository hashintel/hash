import { FilledShape } from "../filled-shape";

export const presentationChartGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M7 12V9m5 3V6m5 6V8" />
        </>
      }
    >
      <rect x="3" y="3" width="18" height="13" rx="0.5" />
    </FilledShape>
    <path d="M12 16v5m-4 0 4-5 4 5" />
  </g>
);
