import { FilledShape } from "./filled-shape";
import { PunctuationDot } from "./shared/punctuation-dot";

const documentFrame = <path d="M5.5 3.5h8l5 5v12H5.5Z" />;
const documentFold = <path d="M13.5 3.5v5h5" />;
const clockFace = <circle cx="12" cy="12" r="8" />;
const eyeFrame = (
  <path d="M2.75 12C5 8.25 8 6 12 6s7 2.25 9.25 6C19 15.75 16 18 12 18S5 15.75 2.75 12Z" />
);

export const additionalGeometry = {
  infinity: (
    <path d="M12 12c-2.5-3-4.1-4.5-6.1-4.5a4.5 4.5 0 0 0 0 9c2 0 3.6-1.5 6.1-4.5s4.1-4.5 6.1-4.5a4.5 4.5 0 0 1 0 9c-2 0-3.6-1.5-6.1-4.5Z" />
  ),
  arrowUp: <path d="M12 20V4M7 9l5-5 5 5" />,
  arrowDown: <path d="M12 4v16m-5-5 5 5 5-5" />,
  arrowLeft: <path d="M20 12H4m5-5-5 5 5 5" />,
  arrowRight: <path d="M4 12h16m-5-5 5 5-5 5" />,
  arrowUpRight: <path d="M5 19 19 5M9 5h10v10" />,
  arrowsLeftRight: (
    <path d="M3.5 7.5h17m-4-4 4 4-4 4M20.5 16.5h-17m4-4-4 4 4 4" />
  ),
  trash: (
    <FilledShape cutout={<path d="M9.5 10v7m5-7v7" />}>
      <path d="m5.5 7.5 1 13h11l1-13" />
      <path
        fill="none"
        data-icon-detail="lid"
        d="M3.5 5.5h17M8.5 5.5V3h7v2.5"
      />
    </FilledShape>
  ),
  pencil: (
    <FilledShape cutout={<path d="m13.5 5.5 5 5M4.5 14.5l5 5" />}>
      <path d="M4.5 14.5 15 4a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3L9.5 19.5l-6 1Z" />
    </FilledShape>
  ),
  copy: (
    <FilledShape>
      <path fill="none" d="M6 16H3.5V3.5H16V6" />
      <rect
        data-icon-detail="sheet"
        x="8"
        y="8"
        width="12.5"
        height="12.5"
        rx="1"
      />
    </FilledShape>
  ),
  download: (
    <>
      <path d="M4 15.5v5h16v-5" />
      <path data-icon-detail="down" d="M12 3v12m-4.5-4.5L12 15l4.5-4.5" />
    </>
  ),
  externalLink: (
    <>
      <path d="M10 4H4v16h16v-6" />
      <path data-icon-detail="out" d="M14 3.5h6.5V10M10 14 20.5 3.5" />
    </>
  ),
  ellipsis: (
    <g fill="currentColor" stroke="none">
      <PunctuationDot x={5} y={12} />
      <PunctuationDot data-icon-detail="dot" x={12} y={12} />
      <PunctuationDot x={19} y={12} />
    </g>
  ),
  ellipsisVertical: (
    <g fill="currentColor" stroke="none">
      <PunctuationDot x={12} y={5} />
      <PunctuationDot data-icon-detail="dot" x={12} y={12} />
      <PunctuationDot x={12} y={19} />
    </g>
  ),
  circleEllipsis: (
    <FilledShape
      cutout={
        <>
          {" "}
          <PunctuationDot x={7} y={12} />
          <PunctuationDot x={12} y={12} />
          <PunctuationDot x={17} y={12} />{" "}
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  ),
  collapse: (
    <path d="m3.5 3.5 5 5M3.5 8.5h5v-5m12 0-5 5m5 0h-5v-5M3.5 20.5l5-5m-5 0h5v5m12 0-5-5m5 0h-5v5" />
  ),
  lockOpen: (
    <FilledShape cutout={<path d="M12 14v3.5" />}>
      <path
        fill="none"
        data-icon-detail="shackle"
        d="M8 10.5V7a4 4 0 0 1 8 0"
      />
      <rect x="5" y="10.5" width="14" height="10" rx="1" />
    </FilledShape>
  ),
  lockClosed: (
    <FilledShape cutout={<path d="M12 14v3.5" />}>
      <path
        fill="none"
        data-icon-detail="shackle"
        d="M8 10.5V7a4 4 0 0 1 8 0v3.5"
      />
      <rect x="5" y="10.5" width="14" height="10" rx="1" />
    </FilledShape>
  ),
  eye: (
    <FilledShape
      cutout={
        <>
          {" "}
          <circle data-icon-detail="pupil" cx="12" cy="12" r="2.5" />{" "}
        </>
      }
    >
      {eyeFrame}
    </FilledShape>
  ),
  eyeSlash: (
    <>
      <FilledShape
        cutout={
          <>
            <circle data-icon-detail="pupil" cx="12" cy="12" r="2.5" />
            <path d="m3 3 18 18" />
          </>
        }
      >
        {eyeFrame}
      </FilledShape>
      <path d="m3 3 3 3m12 12 3 3" />
    </>
  ),
  clock: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path data-icon-detail="clock-hand" d="M12 7v5l3 2" />{" "}
        </>
      }
    >
      {clockFace}
    </FilledShape>
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
      <path d="M3.5 3.5v17h17" />
      <path
        data-icon-detail="bars"
        style={{ transformOrigin: "12px 17px" }}
        d="M8 17v-6m5 6V6m5 11V9"
        strokeWidth="var(--hash-icon-detail-stroke)"
      />
    </>
  ),
  chartLine: (
    <>
      <path d="M3.5 3.5v17h17" />
      <path data-icon-detail="line-chart" d="m6.5 15 4-5 4 3 6-7" />
    </>
  ),
  filter: (
    <FilledShape>
      <path d="M3.5 4.5h17l-6.5 8v6L10 21v-8.5Z" />
    </FilledShape>
  ),
  bracketsCurly: (
    <>
      <path
        data-icon-detail="open-left"
        d="M8.5 3H7c-1.75 0-2.5 1-2.5 3v3c0 1.75-.75 3-2.5 3 1.75 0 2.5 1.25 2.5 3v3c0 2 .75 3 2.5 3h1.5"
      />
      <path
        data-icon-detail="open-right"
        d="M15.5 3H17c1.75 0 2.5 1 2.5 3v3c0 1.75.75 3 2.5 3-1.75 0-2.5 1.25-2.5 3v3c0 2-.75 3-2.5 3h-1.5"
      />
    </>
  ),
  lambda: <path d="M5 4h3l9 16h3M12 11 6 20" />,
  lightning: (
    <FilledShape>
      <path d="M13.5 2.5 4 13h7l-.5 8.5L20 11h-7Z" />
    </FilledShape>
  ),
  code: (
    <>
      <path data-icon-detail="open-left" d="m7.5 6.5-5 5.5 5 5.5" />
      <path data-icon-detail="open-right" d="m16.5 6.5 5 5.5-5 5.5" />
      <path d="m14 3-4 18" />
    </>
  ),
  cube: <path d="m12 2 9 5v10l-9 5-9-5V7Z M3 7l9 5 9-5M12 12v10" />,
  diagramNested: (
    <FilledShape cutout={<path d="M8 8h9v9H8Z" />}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </FilledShape>
  ),
  diagramProject: (
    <FilledShape>
      <path fill="none" d="M12 8v4M6 16v-4h12v4" />
      <rect x="9" y="3" width="6" height="5" rx=".5" />
      <rect x="3" y="16" width="6" height="5" rx=".5" />
      <rect x="15" y="16" width="6" height="5" rx=".5" />
    </FilledShape>
  ),
  shapes: null,
  file: (
    <FilledShape cutout={<> {documentFold} </>}>{documentFrame}</FilledShape>
  ),
  fileLines: (
    <FilledShape
      cutout={
        <>
          {" "}
          {documentFold}
          <path data-icon-detail="lines" d="M9 12h6m-6 4h6" />{" "}
        </>
      }
    >
      {documentFrame}
    </FilledShape>
  ),
  list: (
    <>
      <path data-icon-detail="lines" d="M9 5h12M9 12h12M9 19h12" />
      <PunctuationDot x={4} y={5} />
      <PunctuationDot x={4} y={12} />
      <PunctuationDot x={4} y={19} />
    </>
  ),
  table: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M3 9h18M3 15h18M9 3v18" />{" "}
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </FilledShape>
  ),
  grid: (
    <FilledShape>
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    </FilledShape>
  ),
  bullseye: (
    <FilledShape
      cutout={
        <>
          {" "}
          <circle data-icon-detail="target" cx="12" cy="12" r="5" />{" "}
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </FilledShape>
  ),
  scribble: (
    <>
      <path d="M3.5 17.5C5 4 11 3 10 12s6 10 10-6" />
      <path d="m15.5 7 4.5-1 1 4.5" />
    </>
  ),
  sparkles: (
    <FilledShape>
      <path
        data-icon-detail="sparkle"
        d="M9.5 3.5c1.1 5.2 2.8 7 7.5 8.5-4.7 1.5-6.4 3.3-7.5 8.5C8.4 15.3 6.7 13.5 2 12c4.7-1.5 6.4-3.3 7.5-8.5Z"
      />
      <path fill="none" d="M19 2.5v7m-3.5-3.5h7" />
    </FilledShape>
  ),
  info: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M12 10.5v7" />
          <PunctuationDot x={12} y={6.75} />{" "}
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  ),
  error: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M12 6.5v7" />
          <PunctuationDot x={12} y={17.25} />{" "}
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  ),
  warning: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M12 8v6" />
          <PunctuationDot x={12} y={17.5} />{" "}
        </>
      }
    >
      <path d="M12 3 2 21h20Z" />
    </FilledShape>
  ),
  circleCheck: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="m7 12 3 3 7-7" />{" "}
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  ),
  circleClose: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="m8.5 8.5 7 7m0-7-7 7" />{" "}
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  ),
  terminal: (
    <FilledShape
      cutout={
        <>
          <path data-icon-detail="right" d="m6.5 8 4 4-4 4" />
          <path d="M13.5 16h4" />
        </>
      }
    >
      <rect x="3" y="4" width="18" height="16" rx="1" />
    </FilledShape>
  ),
  text: (
    <path d="M3 4h12M9 4v16M14.5 10h7M17 6.5v10.75c0 1.85.8 2.75 2.6 2.75h1.9" />
  ),
  user: (
    <FilledShape>
      <circle data-icon-detail="filament" cx="12" cy="6.75" r="3.75" />
      <path d="M4.5 21v-2.5c0-4 3.1-6 7.5-6s7.5 2 7.5 6V21" />
    </FilledShape>
  ),
  voice: (
    <path
      data-icon-detail="wave"
      d="M3 10v4m4.5-7.5v11m4.5-14v17m4.5-14v11M21 10v4"
    />
  ),
  transcription: <path data-icon-detail="lines" d="M4 6h16M4 12h16M4 18h10" />,
  assistant: (
    <FilledShape>
      <g data-icon-detail="sparkle">
        <path d="m12 2.5 3.5 3.5-3.5 3.5L8.5 6Zm6 6 3.5 3.5-3.5 3.5-3.5-3.5Zm-6 6 3.5 3.5-3.5 3.5L8.5 18Zm-6-6L9.5 12 6 15.5 2.5 12Z" />
      </g>
    </FilledShape>
  ),
} as const;
