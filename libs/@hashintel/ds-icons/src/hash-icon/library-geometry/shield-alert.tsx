import { FilledShape } from "../filled-shape";

export const shieldAlertGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M12 7v6" />
          <circle cx="12" cy="16" r="0.7" fill="currentColor" stroke="none" />
        </>
      }
    >
      <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z" />
    </FilledShape>
  </g>
);
