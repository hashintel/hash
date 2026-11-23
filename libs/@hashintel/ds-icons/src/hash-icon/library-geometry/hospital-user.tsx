import { FilledShape } from "../filled-shape";
import { CompactUser } from "../shared/compact-user";

export const hospitalUserGeometry = (
  <g fill="none">
    <CompactUser />
    <FilledShape
      cutout={
        <path
          d="M18.5 15v4m-2-2h4"
          strokeWidth="calc(var(--hash-icon-stroke-width) * .75)"
        />
      }
    >
      <rect x="15" y="12.5" width="7" height="8.5" rx="0.5" />
    </FilledShape>
  </g>
);
