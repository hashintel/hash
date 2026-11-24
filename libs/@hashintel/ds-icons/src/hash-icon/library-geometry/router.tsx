import { FilledShape } from "../filled-shape";

export const routerGeometry = (
  <g fill="none">
    <path d="M7 7v6m10-9v9" />
    <FilledShape
      cutout={
        <>
          <g fill="currentColor" stroke="none">
            <circle cx="7" cy="16.5" r="0.8" />
            <circle cx="11" cy="16.5" r="0.8" />
          </g>
        </>
      }
    >
      <path d="M3 13h18v7H3Z" />
    </FilledShape>
  </g>
);
