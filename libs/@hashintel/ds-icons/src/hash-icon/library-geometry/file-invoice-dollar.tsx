import { FilledShape } from "../filled-shape";

export const fileInvoiceDollarGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <path
            strokeWidth="calc(var(--hash-icon-stroke-width) * .6)"
            d="M14.5 12.5c-4-2-6 2-2 2.5s2 4-2 2.5M12 11v8"
          />
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
