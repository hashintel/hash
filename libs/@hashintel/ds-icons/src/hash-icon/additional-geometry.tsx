const documentFrame = <path d="M6 3h8l4 4v14H6Z M14 3v5h4" />;
const clockFace = <circle cx="12" cy="12" r="8" />;
const eyeFrame = <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />;

export const additionalGeometry = {
  infinity: (
    <path d="M12 12c-3-3-4-4-6-4a4 4 0 0 0 0 8c2 0 3-1 6-4s4-4 6-4a4 4 0 0 1 0 8c-2 0-3-1-6-4Z" />
  ),
  arrowUp: <path d="M12 20V4m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 4v16m-6-6 6 6 6-6" />,
  arrowLeft: <path d="M20 12H4m6-6-6 6 6 6" />,
  arrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
  arrowUpRight: <path d="M5 19 19 5H8m11 0v11" />,
  arrowsLeftRight: <path d="M4 8h16l-4-4M20 16H4l4 4" />,
  trash: (
    <>
      <path d="m5 7 1 14h12l1-14M9 10v7m6-7v7" />
      <path data-icon-detail="lid" d="M3 6h18M9 6V3h6v3" />
    </>
  ),
  pencil: (
    <path d="m4 15 11-11a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3L9 20l-6 1Z M13 6l5 5M4 15l5 5" />
  ),
  copy: (
    <>
      <path d="M7 16H3V3h13v4" />
      <rect
        data-icon-detail="sheet"
        x="8"
        y="8"
        width="13"
        height="13"
        rx="1.5"
      />
    </>
  ),
  download: (
    <>
      <path d="M4 16v5h16v-5" />
      <path data-icon-detail="down" d="M12 3v12m-5-5 5 5 5-5" />
    </>
  ),
  externalLink: (
    <>
      <path d="M10 4H4v16h16v-6" />
      <path data-icon-detail="out" d="M12 3h9v9M10 14 21 3" />
    </>
  ),
  ellipsis: (
    <g fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.5" />
      <circle data-icon-detail="dot" cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </g>
  ),
  ellipsisVertical: (
    <g fill="currentColor" stroke="none">
      <circle cx="12" cy="5" r="1.5" />
      <circle data-icon-detail="dot" cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </g>
  ),
  circleEllipsis: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7 12h.01M12 12h.01M17 12h.01" strokeWidth="3" />
    </>
  ),
  collapse: (
    <path d="m3 3 6 6M4 9h5V4m12-1-6 6m5 0h-5V4M3 21l6-6m-5 0h5v5m12 1-6-6m5 0h-5v5" />
  ),
  lockOpen: (
    <>
      <path data-icon-detail="shackle" d="M8 11V7a4 4 0 0 1 8 0" />
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M12 15v2" />
    </>
  ),
  lockClosed: (
    <>
      <path data-icon-detail="shackle" d="M8 11V7a4 4 0 0 1 8 0v4" />
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M12 15v2" />
    </>
  ),
  eye: (
    <>
      {eyeFrame}
      <circle data-icon-detail="pupil" cx="12" cy="12" r="2.5" />
    </>
  ),
  eyeSlash: (
    <>
      {eyeFrame}
      <circle data-icon-detail="pupil" cx="12" cy="12" r="2.5" />
      <path d="m3 3 18 18" />
    </>
  ),
  clock: (
    <>
      {clockFace}
      <path data-icon-detail="clock-hand" d="M12 7v5l3 2" />
    </>
  ),
  clockRotateLeft: (
    <>
      <path d="M4 9a8 8 0 1 1 1 8M4 4v5h5" />
      <path data-icon-detail="clock-hand" d="M12 7v5l3 2" />
    </>
  ),
  rotate: (
    <path d="M20 9a8 8 0 0 0-14-3L3 9m0-5v5h5M4 15a8 8 0 0 0 14 3l3-3m0 5v-5h-5" />
  ),
  rightToLine: (
    <>
      <path data-icon-detail="right" d="M3 12h13m-5-5 5 5-5 5" />
      <path d="M21 4v16" />
    </>
  ),
  flask: null,
  layer: null,
  chartBarSimple: (
    <>
      <path d="M3 3v18h18" />
      <path data-icon-detail="bars" d="M7 17v-5m5 5V6m5 11V9" strokeWidth="3" />
    </>
  ),
  chartLine: (
    <>
      <path d="M3 3v18h18" />
      <path data-icon-detail="line-chart" d="m6 15 4-5 4 3 6-8" />
    </>
  ),
  filter: <path d="M3 4h18l-7 8v7l-4 2v-9Z" />,
  bracketsCurly: (
    <>
      <path
        data-icon-detail="open-left"
        d="M8 3H6c-1 0-2 1-2 2v4c0 2-2 3-2 3s2 1 2 3v4c0 1 1 2 2 2h2"
      />
      <path
        data-icon-detail="open-right"
        d="M16 3h2c1 0 2 1 2 2v4c0 2 2 3 2 3s-2 1-2 3v4c0 1-1 2-2 2h-2"
      />
    </>
  ),
  lambda: <path d="M5 4h3l9 16h3M12 11 6 20" />,
  lightning: <path d="m14 2-11 12h8l-1 8 11-12h-8Z" />,
  code: (
    <>
      <path data-icon-detail="open-left" d="m8 6-6 6 6 6" />
      <path data-icon-detail="open-right" d="m16 6 6 6-6 6" />
      <path d="M14 3l-4 18" />
    </>
  ),
  cube: <path d="m12 2 9 5v10l-9 5-9-5V7Z M3 7l9 5 9-5M12 12v10" />,
  diagramNested: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 7v10h10V7ZM7 12h10" />
    </>
  ),
  diagramProject: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1" />
      <rect x="15" y="3" width="6" height="6" rx="1" />
      <rect x="9" y="15" width="6" height="6" rx="1" />
      <path d="M9 6h6M6 9v3h6v3" />
    </>
  ),
  shapes: null,
  file: documentFrame,
  fileLines: (
    <>
      {documentFrame}
      <path data-icon-detail="lines" d="M9 12h6m-6 4h6" />
    </>
  ),
  list: (
    <>
      <path data-icon-detail="lines" d="M8 5h13M8 12h13M8 19h13" />
      <path d="M3 5h.01M3 12h.01M3 19h.01" strokeWidth="3" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
      <path d="M3 9h18M3 15h18M9 3v18" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  bullseye: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle data-icon-detail="target" cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </>
  ),
  scribble: (
    <>
      <path d="M3 18c2-17 10-17 8-6S18 21 21 5" />
      <path d="m16 7 5-2 1 5" />
    </>
  ),
  sparkles: (
    <>
      <path
        data-icon-detail="sparkle"
        d="m10 3 2.5 6.5L18 12l-5.5 2.5L10 21l-2.5-6.5L2 12l5.5-2.5Z"
      />
      <path d="m19 3 .75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75Z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6m0 4h.01" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2 21h20Z" />
      <path d="M12 9v5m0 3h.01" />
    </>
  ),
  circleCheck: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m7 12 3 3 7-7" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path data-icon-detail="right" d="m6 8 4 4-4 4" />
      <path d="M13 16h5" />
    </>
  ),
  text: <path d="M3 5h18M7 5v14m-3 0h6m6-7h5m-5-3v8c0 2 1 2 3 2" />,
  user: (
    <>
      <circle data-icon-detail="filament" cx="12" cy="7" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  voice: (
    <path data-icon-detail="wave" d="M3 10v4m4-8v12m5-15v18m5-14v10m4-7v4" />
  ),
  transcription: <path data-icon-detail="lines" d="M4 6h16M4 12h16M4 18h10" />,
  assistant: (
    <g data-icon-detail="sparkle">
      <path d="m12 2 4 4-4 4-4-4Zm6 6 4 4-4 4-4-4Zm-6 6 4 4-4 4-4-4ZM6 8l4 4-4 4-4-4Z" />
    </g>
  ),
} as const;
