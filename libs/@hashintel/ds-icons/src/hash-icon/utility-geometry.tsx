import { FilledShape } from "./filled-shape";

const calendarFrame = (
  <>
    <path d="M4 5h16v16H4Z" />
    <path fill="none" d="M8 3v4m8-4v4" />
  </>
);
const sortPyramid = (
  <FilledShape cutout={<path d="M4 0v8" />}>
    <path d="M4 0 0 7 4 8 8 7Z" />
  </FilledShape>
);

export const utilityGeometry = {
  arrowTrendUp: <path d="m3 17 6-6 4 4 8-10m-6 0h6v6" />,
  arrowTrendDown: <path d="m3 7 6 6 4-4 8 10m-6 0h6v-6" />,
  asterisk: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />,
  at: (
    <>
      <circle cx="11" cy="12" r="4" />
      <path d="M15 8v7c0 3 6 2 6-4a9 9 0 1 0-4 8.5" />
    </>
  ),
  barcode: (
    <>
      {[3, 7, 10, 15, 18, 21].map((position) => (
        <path
          key={position}
          data-icon-detail="scan-bar"
          d={`M${position} 4v16`}
          style={{ animationDelay: `${position * 8}ms` }}
        />
      ))}
    </>
  ),
  bell: (
    <FilledShape>
      <path d="M5 10a7 7 0 0 1 14 0v5l2 3H3l2-3Z" />
      <path fill="none" data-icon-detail="bell-clapper" d="M9 21h6" />
    </FilledShape>
  ),
  bracketsSquare: (
    <>
      <path data-icon-detail="open-left" d="M8 3H4v18h4" />
      <path data-icon-detail="open-right" d="M16 3h4v18h-4" />
    </>
  ),
  bug: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M12 10v10" />{" "}
        </>
      }
    >
      <rect x="7" y="6" width="10" height="15" rx="5" />
      <path
        fill="none"
        data-icon-detail="orbit"
        d="m8 3 2 3m6-3-2 3M7 11H3m14 0h4M7 16H3m14 0h4"
      />
    </FilledShape>
  ),
  calendar: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M4 10h16" />
          <path data-icon-detail="calendar-day" d="M8 14h3v3H8Z" />{" "}
        </>
      }
    >
      {calendarFrame}
    </FilledShape>
  ),
  calendarClock: (
    <>
      <path d="M10 21H4V5h16v4M4 10h7M8 3v4m8-4v4" />
      <FilledShape
        cutout={<path data-icon-detail="calendar-hand" d="M16 13v3l2 1" />}
      >
        <circle cx="16" cy="16" r="6" />
      </FilledShape>
    </>
  ),
  circleOne: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="m10 9 2-2v10m-3 0h6" />{" "}
        </>
      }
    >
      <circle cx="12" cy="12" r="9" />
    </FilledShape>
  ),
  cubes: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="m7 5 5 3 5-3M12 8v6M7 11l5 3 5-3M2 14l5 3 5-3 5 3 5-3M7 17v5m5-8v5m5-2v5" />{" "}
        </>
      }
    >
      <path d="m12 2 5 3v6l5 3v5l-5 3-5-3-5 3-5-3v-5l5-3V5Z" />
    </FilledShape>
  ),
  diagramNodes: (
    <>
      <path d="m7 7 10 10M7 17 17 7" />
      <g fill="currentColor" stroke="none">
        <circle cx="5" cy="5" r="3" />
        <circle cx="19" cy="5" r="3" />
        <circle cx="5" cy="19" r="3" />
        <circle cx="19" cy="19" r="3" />
      </g>
    </>
  ),
  diagramSubtask: (
    <FilledShape>
      <>
        <path fill="none" d="M4 3v13h6M4 7h6" />
        <path d="M10 4h11v6H10ZM10 13h11v6H10Z" />
      </>
    </FilledShape>
  ),
  diamondExclamation: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M12 7v6m0 4h.01" />{" "}
        </>
      }
    >
      <path d="m12 2 10 10-10 10L2 12Z" />
    </FilledShape>
  ),
  emptySet: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m3 21 18-18" />
    </>
  ),
  feather: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M8 16 16 8M9 15h6" />{" "}
        </>
      }
    >
      <path d="M5 17C0 5 13 1 21 3c0 8-5 17-13 15" />
      <path fill="none" d="M3 21 8 16" />
    </FilledShape>
  ),
  fileSpreadsheet: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M14 3v5h5M8 11h8v7H8ZM8 14.5h8M12 11v7" />{" "}
        </>
      }
    >
      <path d="M5 3h9l5 5v13H5Z" />
    </FilledShape>
  ),
  gripVertical: (
    <g fill="currentColor" stroke="none">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </g>
  ),
  image: (
    <FilledShape
      cutout={
        <>
          {" "}
          <circle data-icon-detail="filament" cx="8" cy="8" r="2" />
          <path d="m4 19 6-6 3 3 4-5 4 6" />{" "}
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </FilledShape>
  ),
  inputPipe: <path d="M3 12h12m-4-4 4 4-4 4M18 3h3v18h-3" />,
  lightbulbOn: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path data-icon-detail="filament" d="M12 17v-6m-3-3 3 3 3-3" />{" "}
        </>
      }
    >
      <path d="M8 17c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7Z" />
      <path fill="none" d="M9 21h6" />
    </FilledShape>
  ),
  listTree: (
    <FilledShape>
      <>
        <path fill="none" d="M4 3v15h5M4 8h5" />
        <path d="M9 5h12v6H9ZM9 15h12v6H9Z" />
      </>
    </FilledShape>
  ),
  magic: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="m11 10 3 3" />{" "}
        </>
      }
    >
      <path d="m3 18 11-11 3 3L6 21Z" />
      <path
        fill="none"
        data-icon-detail="sparkle"
        d="M6 3v4M4 5h4m10-3v4m-2-2h4m0 9v4m-2-2h4"
      />
    </FilledShape>
  ),
  memoCircleCheck: (
    <>
      <path d="M9 21H4V3h14v6M7 7h8M7 11h3" />
      <FilledShape cutout={<path d="m13 16 2 2 3-4" />}>
        <circle cx="16" cy="16" r="6" />
      </FilledShape>
    </>
  ),
  microscope: (
    <FilledShape>
      <path d="m9 3 5 3-4 7-5-3Z" />
      <path
        fill="none"
        d="M7 12l-1 2m8-8c7 3 7 13-2 13H7m-3-4h8M12 19v2M5 21h14"
      />
    </FilledShape>
  ),
  oneHundred: (
    <>
      <path d="m2 8 3-2v11M2 20h20" />
      <rect x="9" y="6" width="5" height="11" rx="2.5" />
      <rect x="17" y="6" width="5" height="11" rx="2.5" />
    </>
  ),
  personRunning: (
    <g data-icon-detail="runner" style={{ transformOrigin: "10px 22px" }}>
      <g data-runner-part="body">
        <circle cx="15" cy="4" r="2" />
        <path data-runner-part="back-arm" d="M13 9L9 7L4 10" />
        <path data-runner-part="back-leg" d="M10 15L6 19L2 19" />
        <path d="M13 9L10 15" />
        <path data-runner-part="front-arm" d="M13 9L16 13L20 13" />
        <path data-runner-part="front-leg" d="M10 15L15 18L14 22" />
      </g>
    </g>
  ),
  plug: (
    <FilledShape>
      <path fill="none" data-icon-detail="down" d="M7 3v5m10-5v5" />
      <path d="M5 8h14v3a7 7 0 0 1-14 0Z" />
      <path fill="none" d="M12 18v4" />
    </FilledShape>
  ),
  print: (
    <>
      <path d="M7 8V3h10v5M7 17H3V8h18v9h-4m0-6h1" />
      <FilledShape>
        <path data-icon-detail="down" d="M7 14h10v7H7Z" />
      </FilledShape>
    </>
  ),
  puzzlePiece: (
    <FilledShape>
      <path d="M4 5h6V4a2 2 0 0 1 4 0v1h5v5h1a2 2 0 0 1 0 4h-1v6h-5v-1a2 2 0 0 0-4 0v1H4v-6h1a2 2 0 0 0 0-4H4Z" />
    </FilledShape>
  ),
  ruler: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="m8 11 2 2m1-5 2 2m1-5 2 2M5 14l2 2" />{" "}
        </>
      }
    >
      <path d="m3 16 13-13 5 5L8 21Z" />
    </FilledShape>
  ),
  sortDown: <path d="M5 3v18m-3-3 3 3 3-3M11 5h10M11 10h7M11 15h4" />,
  sortUp: <path d="M5 21V3m-3 3 3-3 3 3M11 5h4M11 10h7M11 15h10" />,
  sortDownNumeric: (
    <path d="M5 3v18m-3-3 3 3 3-3M13.5 5l2-2v6M17.5 16.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0c0 3-1 4.5-3.5 4.5" />
  ),
  sortUpNumeric: (
    <path d="M5 21V3m-3 3 3-3 3 3M17.5 6.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0c0 3-1 4.5-3.5 4.5M13.5 16l2-2v7" />
  ),
  sortDownAlphabetical: (
    <path d="M5 3v18m-3-3 3 3 3-3m3-9 4-6 4 6m-6-2h4m-6 7h8l-8 7h8" />
  ),
  sortUpAlphabetical: (
    <path d="M5 21V3m-3 3 3-3 3 3m3-2h8l-8 7h8m-8 10 4-7 4 7m-6-2h4" />
  ),
  sortDownShapes: (
    <>
      <path d="M5 3v18m-3-3 3 3 3-3" />
      <FilledShape>
        <circle cx="16" cy="6" r="3" />
      </FilledShape>
      <g transform="translate(12 13)">{sortPyramid}</g>
    </>
  ),
  sortUpShapes: (
    <>
      <path d="M5 21V3m-3 3 3-3 3 3" />
      <FilledShape>
        <circle cx="16" cy="18" r="3" />
      </FilledShape>
      <g transform="translate(12 3)">{sortPyramid}</g>
    </>
  ),
  sortDownSize: (
    <path d="M5 3v18m-3-3 3 3 3-3M11 4h10M11 9h7M11 14h4M11 19h1" />
  ),
  sortUpSize: <path d="M5 21V3m-3 3 3-3 3 3M11 4h1M11 9h4M11 14h7M11 19h10" />,
  squareCheck: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="m7 12 3 3 7-7" />{" "}
        </>
      }
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </FilledShape>
  ),
  star: (
    <path d="m12 2 3 6.5 7 .8-5.2 4.8 1.5 7-6.3-3.5-6.3 3.5 1.5-7L2 9.3l7-.8Z" />
  ),
  thoughtBubble: (
    <FilledShape>
      <>
        <path d="M6 15a5 5 0 0 1-1-10 6 6 0 0 1 11-1 5 5 0 1 1 1 10H8" />
        <circle data-icon-detail="dot" cx="6" cy="18" r="2" />
        <circle cx="2.5" cy="22" r=".7" fill="currentColor" stroke="none" />
      </>
    </FilledShape>
  ),
  truck: (
    <FilledShape>
      <path d="M5 18H3V5h11v13h-3" />
      <path fill="none" d="M14 7h4l4 5v6h-2M14 12h8" />
      <circle cx="8" cy="18" r="3" />
      <circle cx="17" cy="18" r="3" />
    </FilledShape>
  ),
  userPlus: (
    <>
      <FilledShape>
        <circle data-icon-detail="filament" cx="9" cy="7" r="4" />
      </FilledShape>
      <path d="M2 21v-2a7 7 0 0 1 11-5m5-2v10m-4-5h8" />
    </>
  ),
} as const;
