import { FilledShape } from "../filled-shape";

export const conveyorBeltGeometry = (
  <g fill="none">
    <rect x="2.5" y="15" width="19" height="5" rx="2.5" />
    <circle cx="6" cy="17.5" r="0.7" />
    <circle cx="12" cy="17.5" r="0.7" />
    <circle cx="18" cy="17.5" r="0.7" />
    <FilledShape
      cutout={
        <>
          <path d="M12 4v3" />
        </>
      }
    >
      <rect x="8" y="4" width="8" height="8" rx="0.5" />
    </FilledShape>
  </g>
);
