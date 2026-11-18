import { FilledShape } from "../filled-shape";

export const calendarDayGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M3.5 9.5h17" />
          <rect x="10" y="12.5" width="4" height="4" rx="0.3" />
        </>
      }
    >
      <rect x="3.5" y="5.5" width="17" height="15" rx="1" />
    </FilledShape>
    <path d="M8 3v5m8-5v5" />
  </g>
);
