import { FilledShape } from "../filled-shape";

export const messageQuestionGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M9 8c0-3 6-3 6 0 0 2-3 1-3 4" />
          <circle cx="12" cy="14" r="0.6" fill="currentColor" stroke="none" />
        </>
      }
    >
      <path d="M3 4h18v13H10l-5 4v-4H3Z" />
    </FilledShape>
  </g>
);
