import { FilledShape } from "../filled-shape";

export const teddyBearGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <circle cx="9" cy="8" r="0.6" fill="currentColor" stroke="none" />
          <circle cx="15" cy="8" r="0.6" fill="currentColor" stroke="none" />
          <path d="m10 11 2 1 2-1M12 12v2" />
        </>
      }
    >
      <circle cx="6" cy="5" r="3" />
      <circle cx="18" cy="5" r="3" />
      <circle cx="12" cy="9" r="6" />
      <path d="M7 14c-5 0-5 5-2 5l1 3h4l2-3 2 3h4l1-3c3 0 3-5-2-5" />
    </FilledShape>
  </g>
);
