import { FilledShape } from "../filled-shape";

export const calendarCheckGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3.5 9.5h17" />
          <path d="m8 14 3 3 5-5" />
        </>
      }
    >
      <rect x="3.5" y="5.5" width="17" height="15" rx="1" />
    </FilledShape>
    <path d="M8 3v5m8-5v5" />
  </g>
);
