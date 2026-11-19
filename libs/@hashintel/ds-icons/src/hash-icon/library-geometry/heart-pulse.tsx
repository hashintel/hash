import { FilledShape } from "../filled-shape";

export const heartPulseGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path
            strokeWidth="calc(var(--hash-icon-stroke-width) * .7)"
            data-icon-detail="wave"
            d="M6 12h3l1.5-3 2.5 6 1.5-3H18"
          />
        </>
      }
    >
      <path d="M12 20 4.5 12.5C-.5 7.5 6 .5 12 6.5 18 .5 24.5 7.5 19.5 12.5Z" />
    </FilledShape>
  </g>
);
