import { FilledShape } from "./filled-shape";

export const logicGeometry = {
  logicSignalBounded: (
    <>
      <path d="M5 2.5v4m0-2h14m0-2v4" />
      <path d="M2.5 14c3.25 0 3.25-5.5 6.5-5.5s3.25 11 6.5 11 3.25-5.5 6-5.5" />
    </>
  ),
  logicSignalThreshold: (
    <>
      <path d="M2.5 9.5h19" strokeDasharray="2.5 2" />
      <path d="M2.5 17c3.25 0 3.25-12 6.5-12s3.25 14 6.5 14 3.25-7 6-7" />
    </>
  ),
  logicSignalClock: (
    <>
      <FilledShape cutout={<path d="M17.5 4.25V6.5l1.5.85" />}>
        <circle cx="17.5" cy="6.5" r="4" />
      </FilledShape>
      <path d="M2.5 16c3.25 0 3.25-4 6.5-4s3.25 8 6.5 8 3.25-4 6-4" />
    </>
  ),
  logicStateSequence: (
    <g strokeWidth="calc(var(--hash-icon-stroke-width) * .8)">
      <path d="M6.25 12h2m4.5 0h2m4.5 0H22m-2-2 2 2-2 2" />
      <circle cx="4" cy="12" r="2.25" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="12" r="2.25" />
      <circle cx="17" cy="12" r="2.25" />
    </g>
  ),
  logicTemporalOperators: (
    <>
      <rect x="3" y="5" width="6" height="6" />
      <path d="m17 4 4 4-4 4-4-4Z M2.5 19h19m-3-3 3 3-3 3" />
    </>
  ),
  logicBooleanTrace: (
    <path d="M2.5 14H7V6h6v8h5V6h3.5M2.5 20h19m-3-3 3 3-3 3" />
  ),
  logicAnd: <path d="M4.5 19 12 5l7.5 14" />,
  logicOr: <path d="M4.5 5 12 19l7.5-14" />,
  logicNot: <path d="M4.5 8h15v9" />,
} as const;
