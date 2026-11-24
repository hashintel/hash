import { FilledShape } from "../filled-shape";
import { CompactUser } from "../shared/compact-user";

export const userLockGeometry = (
  <g fill="none">
    <CompactUser />
    <path d="M16.5 15v-2.5a2 2 0 0 1 4 0V15" />
    <FilledShape>
      <rect x="15" y="15" width="7" height="6" rx="0.5" />
    </FilledShape>
  </g>
);
