import { FilledShape } from "../filled-shape";

export const dewPointGeometry = (
  <g fill="none">
    <FilledShape>
      <path d="M7 3S3 10 3 14a4 4 0 0 0 8 0C11 10 7 3 7 3Z" />
    </FilledShape>
    <FilledShape
      cutout={
        <>
          <path
            strokeWidth="calc(var(--hash-icon-stroke-width) * .7)"
            d="M18.5 7v9"
          />
        </>
      }
    >
      <path d="M16.5 12V5a2 2 0 0 1 4 0v7a4 4 0 1 1-4 0Z" />
    </FilledShape>
  </g>
);
