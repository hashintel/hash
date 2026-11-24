import { FilledShape } from "../filled-shape";

export const surveyGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="m6 8 1 1 2-3M12 7h6M6 13h3v3H6Zm6 1h6" />
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="0.5" />
    </FilledShape>
  </g>
);
