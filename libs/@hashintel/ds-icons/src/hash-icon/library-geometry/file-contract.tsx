import { FilledShape } from "../filled-shape";

export const fileContractGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <path d="M9 11h3m-3 3h6m-6 4 2-2 2 2 2-1" />
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
