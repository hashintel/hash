import { FilledShape } from "../filled-shape";

export const fileInvoiceDollarGeometry = (
  <g fill="none">
    <FilledShape
      cutout={
        <>
          <path d="M13.5 3.5v5h5" />
          <path
            strokeWidth="calc(var(--hash-icon-stroke-width) * .65)"
            d="M14.25 12.1c0-.9-.95-1.5-2.25-1.5s-2.25.65-2.25 1.65c0 2.25 4.5 1.15 4.5 3.4 0 1-.95 1.75-2.25 1.75s-2.25-.7-2.25-1.7M12 9.7v8.6"
          />
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12h-13Z" />
    </FilledShape>
  </g>
);
