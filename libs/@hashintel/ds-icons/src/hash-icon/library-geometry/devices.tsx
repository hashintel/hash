import { FilledShape } from "../filled-shape";

export const devicesGeometry = (
  <g fill="none">
    <path d="M11 17H3V3h15v6M8 17v4H4" />
    <FilledShape
      cutout={
        <>
          <path d="M16 19h2" />
        </>
      }
    >
      <rect x="13" y="10" width="8" height="12" rx="1" />
    </FilledShape>
  </g>
);
