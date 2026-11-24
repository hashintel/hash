import { FilledShape } from "../filled-shape";

export const monitoringInstrumentGeometry = (
  <g fill="none">
    <path d="M16 3v3m-2-3h4M8 20v2m8-2v2" />
    <FilledShape
      cutout={
        <>
          <g strokeWidth="calc(var(--hash-icon-stroke-width) * .7)">
            <path d="M8 9h8v4H8Zm0 8h2m4 0h2" />
          </g>
        </>
      }
    >
      <path d="M5 6h14v14H5Z" />
    </FilledShape>
  </g>
);
