import { FilledShape } from "../filled-shape";
import { CompactUser } from "../shared/compact-user";

export const userTagGeometry = (
  <g fill="none">
    <CompactUser />
    <FilledShape
      cutout={
        <circle cx="17.3" cy="14.8" r=".65" fill="currentColor" stroke="none" />
      }
    >
      <path d="M15 12.5h4l3.5 4-4 4-3.5-4Z" />
    </FilledShape>
  </g>
);
