import { FilledShape } from "../filled-shape";

export const bookOpenGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M12 6v15M6 9h3m6 0h3M6 13h3m6 0h3" />
        </>
      }
    >
      <path d="M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Z" />
    </FilledShape>
  </g>
);
