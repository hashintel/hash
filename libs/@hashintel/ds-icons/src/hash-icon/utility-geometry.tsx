import { FilledShape } from "./filled-shape";
import { PunctuationDot } from "./shared/punctuation-dot";

const calendarFrame = (
  <>
    <rect x="4" y="5" width="16" height="16" rx="1" />
    <path fill="none" d="M8 3v4m8-4v4" />
  </>
);
const sortLetterA = <path d="M12.9 7 15.7 0h.6l2.8 7M13.8 4.75h4.4" />;
const sortLetterZ = <path d="M13.4 0h5.2v.35l-5.2 6.3V7h5.2" />;
const sortDigitOne = (
  <path
    d="M16.5-.15v7.3M13.5 1.75h2c.65 0 1-.35 1-1.1"
    strokeWidth="calc(var(--hash-icon-stroke-width) * .9)"
  />
);
const sortDigitNine = (
  <path d="M18.5 2.25c0 1.25-.95 2.25-2.5 2.25s-2.5-1-2.5-2.25S14.45 0 16 0s2.5 1 2.5 2.25c0 3.65-.5 4.75-2.5 4.75-1.35 0-2.1-.65-2.3-1.8" />
);
const sortCheck = <path d="m12 3.5 3 3 5-6" />;
const sortCross = <path d="m13 .5 6 6m0-6-6 6" />;
const sortCalendar = (
  <FilledShape
    cutout={
      <>
        <path d="M10.5 10h11" />
        <PunctuationDot
          x={14}
          y={13.5}
          strokeWidth="calc(var(--hash-icon-stroke-width) * .85)"
        />
        <PunctuationDot
          x={18}
          y={13.5}
          strokeWidth="calc(var(--hash-icon-stroke-width) * .85)"
        />
        <PunctuationDot
          x={14}
          y={17}
          strokeWidth="calc(var(--hash-icon-stroke-width) * .85)"
        />
      </>
    }
  >
    <rect x="10.5" y="5.5" width="11" height="15" rx=".5" />
    <path fill="none" d="M13 3v5m6-5v5" />
  </FilledShape>
);
const sortClock = (
  <FilledShape cutout={<path d="M16 8v4l3 2" />}>
    <circle cx="16" cy="12" r="6" />
  </FilledShape>
);
const sortHighPriority = (
  <>
    <path d="M16 0v4.75" />
    <PunctuationDot x={16} y={6.75} />
  </>
);
const sortLowPriority = <path d="M13 3.5h6" />;
const sortEmptyValue = <circle cx="16" cy="3.5" r="3" fill="none" />;
const sortPresentValue = <circle cx="16" cy="3.5" r="3" fill="currentColor" />;
const sortUpperTransform = "translate(16 6.5) scale(1.1) translate(-16 -3.5)";
const sortLowerTransform = "translate(16 17.5) scale(.9) translate(-16 -3.5)";
const sortCircle = (
  <FilledShape>
    <circle cx="16" cy="3.5" r="3.5" />
  </FilledShape>
);
const sortTriangle = (
  <FilledShape>
    <path d="M16 0 12 7h8Z" />
  </FilledShape>
);

export const utilityGeometry = {
  arrowTrendUp: <path d="m3.5 17 6-6 4 4 7-10M14 5h6.5v6.5" />,
  arrowTrendDown: <path d="m3.5 7 6 6 4-4 7 10M14 19h6.5v-6.5" />,
  asterisk: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />,
  at: (
    <>
      <path d="M8 9c.4-1.8 1.7-2.7 3.7-2.7 2.5 0 3.8 1.35 3.8 3.7v5.2c0 2.9 5.5 2.2 5.5-3.7C21 6.1 17.5 3 12.5 3 6.6 3 3 6.9 3 12.3 3 18 6.9 21 12.6 21h4.1" />
      <path d="M15.5 10.75h-3.7c-2.7 0-4.1 1-4.1 3 0 1.8 1.25 2.9 3.3 2.9 2.75 0 4.5-1.7 4.5-4.1" />
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
      <path d="M4 18c2-2 2.5-3 2.5-6V9a5.5 5.5 0 0 1 11 0v3c0 3 .5 4 2.5 6Z" />
      <path fill="none" data-icon-detail="bell-clapper" d="M9.5 21h5" />
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
          <path d="m9.5 9 3-2v10.5" />{" "}
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
    <FilledShape>
      <path fill="none" d="m6.6 6.6 3.8 3.8m3.2 0 3.8-3.8M12 14.25v3" />
      <circle cx="5" cy="5" r="2.25" />
      <circle cx="19" cy="5" r="2.25" />
      <circle cx="12" cy="12" r="2.25" />
      <circle cx="12" cy="19.5" r="2.25" />
    </FilledShape>
  ),
  diagramSubtask: (
    <FilledShape>
      <path fill="none" d="M4 3v14h6M4 7h6" />
      <path d="M10 4h11v6H10ZM10 14h11v6H10Z" />
    </FilledShape>
  ),
  diamondExclamation: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M12 8v4.75" />
          <PunctuationDot x={12} y={16} />{" "}
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
    <FilledShape cutout={<path d="M7.5 16.5 17 7M11 13h5" />}>
      <path d="M6.5 18C2 13 5 3 20.5 3.5c0 15.5-10 18.5-14 14.5Z" />
      <path fill="none" d="M3 21l4.5-4.5" />
    </FilledShape>
  ),
  fileSpreadsheet: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path d="M13.5 3.5v5h5M8.5 11.5h7v6h-7ZM8.5 14.5h7M12 11.5v6" />{" "}
        </>
      }
    >
      <path d="M5.5 3.5h8l5 5v12H5.5Z" />
    </FilledShape>
  ),
  gripVertical: (
    <g fill="currentColor" stroke="none">
      <PunctuationDot x={9} y={5} />
      <PunctuationDot x={15} y={5} />
      <PunctuationDot x={9} y={12} />
      <PunctuationDot x={15} y={12} />
      <PunctuationDot x={9} y={19} />
      <PunctuationDot x={15} y={19} />
    </g>
  ),
  image: (
    <FilledShape
      cutout={
        <>
          <circle data-icon-detail="filament" cx="8" cy="8.5" r="1.5" />
          <path d="m3.5 18 6-5.5 3.5 3 4-4.5 3.5 4" />
        </>
      }
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
    </FilledShape>
  ),
  inputPipe: <path d="M3 12h12m-4-4 4 4-4 4M18 3h3v18h-3" />,
  link: (
    <g fill="none">
      <path d="m9.5 8.5 3.5-3.5a4.25 4.25 0 0 1 6 6l-3 3c-1.65 1.65-4.35 1.65-6 0" />
      <path d="m14.5 15.5-3.5 3.5a4.25 4.25 0 0 1-6-6l3-3c1.65-1.65 4.35-1.65 6 0" />
    </g>
  ),
  linkBroken: (
    <g fill="none">
      <path d="M13.5 4.5a4.25 4.25 0 0 1 6 6L17 13M7 11l-2.5 2.5a4.25 4.25 0 0 0 6 6" />
      <path d="M7 3v4H3m14 14v-4h4" />
    </g>
  ),
  lightbulbOn: (
    <FilledShape
      cutout={<path data-icon-detail="filament" d="M12 17v-5m-3-3 3 3 3-3" />}
    >
      <path d="M8.5 17.5c0-3-3-3.5-3-8a6.5 6.5 0 0 1 13 0c0 4.5-3 5-3 8Z" />
      <path fill="none" d="M8.5 20.5h7" />
    </FilledShape>
  ),
  listTree: (
    <FilledShape>
      <path fill="none" d="M4 3v15h5M4 7h5" />
      <path d="M9 4h12v6H9ZM9 15h9v6H9Z" />
    </FilledShape>
  ),
  magic: (
    <FilledShape cutout={<path d="m11.5 10.5 3 3" />}>
      <path d="M3.5 17.5 14 7l3 3L6.5 20.5Z" />
      <path
        fill="none"
        data-icon-detail="sparkle"
        d="M6 2.5v5M3.5 5h5M19 2v6m-3-3h6M19 14v5m-2.5-2.5h5"
      />
    </FilledShape>
  ),
  memoCircleCheck: (
    <>
      <path d="M8.5 21H4V3h14v5M7 7h7M7 11h2.5" />
      <FilledShape cutout={<path d="m12.5 16 2.5 2.5 4-4.5" />}>
        <circle cx="16" cy="16" r="5.5" />
      </FilledShape>
    </>
  ),
  microscope: (
    <FilledShape>
      <path d="m9 3 5 3-4 7-5-3Z" />
      <path
        fill="none"
        d="m6.5 12.5-1 1.5M14 6c7 3 6.5 12.5-1.5 12.5H7M3.5 15.5H12M12 18.5V21M4.5 21h15"
      />
    </FilledShape>
  ),
  oneHundred: (
    <>
      <path d="m2 8 2.5-2v11M2 20.5h20" />
      <ellipse cx="11" cy="11.5" rx="2.5" ry="5.5" />
      <ellipse cx="19" cy="11.5" rx="2.5" ry="5.5" />
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
      <path fill="none" data-icon-detail="down" d="M8 3v5m8-5v5" />
      <path d="M5.5 8h13v3a6.5 6.5 0 0 1-13 0Z" />
      <path fill="none" d="M12 17.5V22" />
    </FilledShape>
  ),
  print: (
    <>
      <path d="M7 8V3.5h10V8M6.5 17H3.5V8h17v9h-3" />
      <PunctuationDot x={17} y={11} />
      <FilledShape>
        <path data-icon-detail="down" d="M6.5 14h11v6.5h-11Z" />
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
      cutout={<path d="m7.5 11.5 2 2m1-5 2 2m1-5 2 2M4.5 14.5l2 2" />}
    >
      <path d="m3 16 13-13 5 5L8 21Z" />
    </FilledShape>
  ),
  sortDown: <path d="M5 3v18m-3-3 3 3 3-3M11 5h10M11 10h7M11 15h4" />,
  sortUp: <path d="M5 21V3m-3 3 3-3 3 3M11 5h4M11 10h7M11 15h10" />,
  sortDownBoolean: (
    <>
      <path d="M5 3v18m-3-3 3 3 3-3" />
      <g strokeWidth="calc(var(--hash-icon-stroke-width) * .8)">
        <g transform={sortUpperTransform}>{sortCross}</g>
        <g transform={sortLowerTransform}>{sortCheck}</g>
      </g>
    </>
  ),
  sortUpBoolean: (
    <>
      <path d="M5 21V3m-3 3 3-3 3 3" />
      <g strokeWidth="calc(var(--hash-icon-stroke-width) * .8)">
        <g transform={sortUpperTransform}>{sortCheck}</g>
        <g transform={sortLowerTransform}>{sortCross}</g>
      </g>
    </>
  ),
  sortDownDate: (
    <>
      <path d="M5 3v18m-3-3 3 3 3-3" />
      {sortCalendar}
    </>
  ),
  sortUpDate: (
    <>
      <path d="M5 21V3m-3 3 3-3 3 3" />
      {sortCalendar}
    </>
  ),
  sortDownDuration: (
    <>
      <path d="M5 3v18m-3-3 3 3 3-3" />
      {sortClock}
    </>
  ),
  sortUpDuration: (
    <>
      <path d="M5 21V3m-3 3 3-3 3 3" />
      {sortClock}
    </>
  ),
  sortDownPriority: (
    <>
      <path d="M5 3v18m-3-3 3 3 3-3" />
      <g transform={sortUpperTransform}>{sortHighPriority}</g>
      <g transform={sortLowerTransform}>{sortLowPriority}</g>
    </>
  ),
  sortUpPriority: (
    <>
      <path d="M5 21V3m-3 3 3-3 3 3" />
      <g transform={sortUpperTransform}>{sortLowPriority}</g>
      <g transform={sortLowerTransform}>{sortHighPriority}</g>
    </>
  ),
  sortDownEmptyValues: (
    <>
      <path d="M5 3v18m-3-3 3 3 3-3" />
      <g transform={sortUpperTransform}>{sortEmptyValue}</g>
      <g transform={sortLowerTransform}>{sortPresentValue}</g>
    </>
  ),
  sortUpEmptyValues: (
    <>
      <path d="M5 21V3m-3 3 3-3 3 3" />
      <g transform={sortUpperTransform}>{sortPresentValue}</g>
      <g transform={sortLowerTransform}>{sortEmptyValue}</g>
    </>
  ),
  sortDownNumeric: (
    <>
      <path d="M5 3v18m-3-3 3 3 3-3" />
      <g strokeWidth="calc(var(--hash-icon-stroke-width) * .8)">
        <g transform={sortUpperTransform}>{sortDigitOne}</g>
        <g transform={sortLowerTransform}>{sortDigitNine}</g>
      </g>
    </>
  ),
  sortUpNumeric: (
    <>
      <path d="M5 21V3m-3 3 3-3 3 3" />
      <g strokeWidth="calc(var(--hash-icon-stroke-width) * .8)">
        <g transform={sortUpperTransform}>{sortDigitNine}</g>
        <g transform={sortLowerTransform}>{sortDigitOne}</g>
      </g>
    </>
  ),
  sortDownAlphabetical: (
    <>
      <path d="M5 3v18m-3-3 3 3 3-3" />
      <g strokeWidth="calc(var(--hash-icon-stroke-width) * .8)">
        <g transform={sortUpperTransform}>{sortLetterA}</g>
        <g transform={sortLowerTransform}>{sortLetterZ}</g>
      </g>
    </>
  ),
  sortUpAlphabetical: (
    <>
      <path d="M5 21V3m-3 3 3-3 3 3" />
      <g strokeWidth="calc(var(--hash-icon-stroke-width) * .8)">
        <g transform={sortUpperTransform}>{sortLetterZ}</g>
        <g transform={sortLowerTransform}>{sortLetterA}</g>
      </g>
    </>
  ),
  sortDownShapes: (
    <>
      <path d="M5 3v18m-3-3 3 3 3-3" />
      <g transform={sortUpperTransform}>{sortCircle}</g>
      <g transform={sortLowerTransform}>{sortTriangle}</g>
    </>
  ),
  sortUpShapes: (
    <>
      <path d="M5 21V3m-3 3 3-3 3 3" />
      <g transform={sortUpperTransform}>{sortTriangle}</g>
      <g transform={sortLowerTransform}>{sortCircle}</g>
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
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </FilledShape>
  ),
  star: (
    <path d="m12 2.75 2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.31l-5.7 3 1.09-6.35-4.62-4.5 6.38-.93Z" />
  ),
  thoughtBubble: (
    <FilledShape>
      <path d="M7 15.5a5 5 0 0 1-3-9 6 6 0 0 1 10.5-2.75A5.75 5.75 0 1 1 17 15.5Z" />
      <circle data-icon-detail="dot" cx="6" cy="19" r="1.5" />
      <circle cx="2.5" cy="22" r=".75" fill="currentColor" stroke="none" />
    </FilledShape>
  ),
  truck: (
    <FilledShape>
      <path d="M5.5 18H3V5h11v13H10.5" />
      <path fill="none" d="M14 8h4l3 4v6h-2.5M14 12h7" />
      <circle cx="8" cy="18" r="2.5" />
      <circle cx="16" cy="18" r="2.5" />
    </FilledShape>
  ),
  userPlus: (
    <>
      <FilledShape>
        <circle data-icon-detail="filament" cx="9" cy="6.75" r="3.75" />
        <path fill="none" d="M2 21v-2.5c0-4 3-6 7-6 1.8 0 3.4.4 4.5 1.2" />
      </FilledShape>
      <path d="M18 12v9m-4.5-4.5h9" />
    </>
  ),
} as const;
