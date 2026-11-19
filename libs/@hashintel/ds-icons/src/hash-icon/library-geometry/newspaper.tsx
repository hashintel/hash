import { FilledShape } from "../filled-shape";

export const newspaperGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M6 8h9M6 12h3v5H6Zm6 0h3m-3 4h3" />
        </>
      }
    >
      <path d="M3 4h15v15a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2Z" />
    </FilledShape>
    <path d="M18 8h4v11a2 2 0 0 1-4 0" />
  </g>
);
