import { FilledShape } from "./filled-shape";
import { PunctuationDot } from "./shared/punctuation-dot";

const matrixBrackets = <path d="M6 3H3v18h3M18 3h3v18h-3" />;
const testTube = (
  <>
    <FilledShape cutout={<path data-icon-detail="liquid-level" d="M6 12h5" />}>
      <path d="M11 5 3.5 12.5a4.2 4.2 0 0 0 6 6L17 11" />
    </FilledShape>
    <path d="m9 3 9 9" />
  </>
);

export const explorationGeometry = {
  sum: <path data-icon-detail="notation" d="M19 4H5l8 8-8 8h14" />,
  sumRange: (
    <>
      <path data-icon-detail="notation" d="M17 7H7l6 5-6 5h10" />
      <path data-icon-detail="bounds" d="M10 2h4M10 22h4" />
    </>
  ),
  integral: (
    <path
      data-icon-detail="notation"
      d="M17 3h-2c-2 0-3 2-3 5v8c0 3-1 5-3 5H7"
    />
  ),
  integralBounds: (
    <>
      <path
        data-icon-detail="notation"
        d="M16 4h-1c-2 0-3 2-3 5v6c0 3-1 5-3 5H8"
      />
      <path data-icon-detail="bounds" d="M18 3h3M3 21h3" />
    </>
  ),
  matrix: (
    <>
      {matrixBrackets}
      <g data-icon-detail="cells">
        <PunctuationDot x={9} y={8} />
        <PunctuationDot x={15} y={8} />
        <PunctuationDot x={9} y={16} />
        <PunctuationDot x={15} y={16} />
      </g>
    </>
  ),
  matrixGrid: (
    <>
      {matrixBrackets}
      <path
        data-icon-detail="row"
        d="M8 7h2m4 0h2M8 12h2m4 0h2M8 17h2m4 0h2"
        strokeWidth="var(--hash-icon-dot-size)"
      />
    </>
  ),
  probability: (
    <>
      <path d="M3 20h18" />
      <path
        data-icon-detail="distribution"
        d="M3 20C8 20 7.25 5 12 5s4 15 9 15"
      />
      <path d="M12 16v4" />
    </>
  ),
  probabilityDice: (
    <FilledShape
      cutout={
        <>
          {" "}
          <g data-icon-detail="cells" fill="currentColor" stroke="none">
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="16" cy="8" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="8" cy="16" r="1.5" />
            <circle cx="16" cy="16" r="1.5" />
          </g>{" "}
        </>
      }
    >
      <rect x="4" y="4" width="16" height="16" rx="1" />
    </FilledShape>
  ),
  expression: (
    <>
      <path data-icon-detail="open-left" d="m6.5 6-4 6 4 6" />
      <path data-icon-detail="open-right" d="m17.5 6 4 6-4 6" />
      <path data-icon-detail="notation" d="m9.5 8.5 5 7m0-7-5 7" />
    </>
  ),
  expressionTree: (
    <FilledShape>
      <path fill="none" d="M12 8.5V12M5.5 16v-4h13v4" />
      <circle data-icon-detail="node" cx="12" cy="5.5" r="3" />
      <rect x="3" y="16" width="5" height="5" rx=".5" />
      <rect x="16" y="16" width="5" height="5" rx=".5" />
    </FilledShape>
  ),
  typeVariable: (
    <>
      <path data-icon-detail="notation" d="M3 4.5h12M9 4.5V20" />
      <path data-icon-detail="type-mark" d="m16 13 5 7m0-7-5 7" />
    </>
  ),
  typeUnion: (
    <FilledShape>
      <circle data-icon-detail="open-left" cx="5.5" cy="12" r="3.25" />
      <path fill="none" d="M12 4v16" />
      <rect
        data-icon-detail="open-right"
        x="16"
        y="8.75"
        width="6"
        height="6.5"
        rx=".5"
      />
    </FilledShape>
  ),
  breakpoint: (
    <FilledShape
      cutout={
        <>
          {" "}
          <circle
            data-icon-detail="target"
            cx="12"
            cy="12"
            r="3"
            fill="currentColor"
          />{" "}
        </>
      }
    >
      <path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z" />
    </FilledShape>
  ),
  breakpointLine: (
    <FilledShape>
      <>
        <path fill="none" d="M9 5h12M9 19h12" />
        <path fill="none" data-icon-detail="lines" d="M11 12h10" />
        <circle data-icon-detail="target" cx="5" cy="12" r="3" />
      </>
    </FilledShape>
  ),
  testTube: <g transform="translate(1.5 0)">{testTube}</g>,
  testTubeCheck: (
    <>
      {testTube}
      <path data-icon-detail="test-result" d="m14 18 2 2 5-5" fill="none" />
    </>
  ),
  testTubeCross: (
    <>
      {testTube}
      <path data-icon-detail="test-result" d="m15 15 5 5m0-5-5 5" fill="none" />
    </>
  ),
  testCheck: (
    <FilledShape
      cutout={
        <>
          {" "}
          <path data-icon-detail="test-result" d="m8 13 3 3 5-6" />{" "}
        </>
      }
    >
      <path d="M9 3H5v18h14V3h-4" />
      <path fill="none" d="M9 2h6v4H9Z" />
    </FilledShape>
  ),
  agent: (
    <FilledShape
      cutout={
        <>
          <g data-icon-detail="eyes" style={{ transformOrigin: "12px 12px" }}>
            <PunctuationDot x={8.5} y={12} />
            <PunctuationDot x={15.5} y={12} />
          </g>
          <path d="M9 17h6" />
        </>
      }
    >
      <rect x="4" y="6.5" width="16" height="14" rx="2" />
      <path fill="none" data-icon-detail="antenna" d="M12 6.5V2.5m-2 0h4" />
    </FilledShape>
  ),
  agentOrbit: (
    <FilledShape>
      <circle cx="12" cy="12" r="3.5" />
      <g data-icon-detail="orbit">
        <path
          fill="none"
          d="M3 12a9 9 0 0 1 13.5-7.794M21 12a9 9 0 0 1-13.5 7.794"
        />
        <circle cx="4.206" cy="16.5" r="2" />
        <circle cx="19.794" cy="7.5" r="2" />
      </g>
    </FilledShape>
  ),
  context: (
    <FilledShape
      cutout={<path data-icon-detail="lines" d="M10.5 8h6.5m-6.5 4h4.5" />}
    >
      <rect x="7" y="3.5" width="13.5" height="15.5" rx="1" />
      <path fill="none" data-icon-detail="sheet" d="M3.5 7v13.5H17" />
    </FilledShape>
  ),
  contextWindow: (
    <>
      <path data-icon-detail="open-left" d="M6 3H3v18h3" />
      <path data-icon-detail="open-right" d="M18 3h3v18h-3" />
      <path data-icon-detail="row" d="M8 7h8M8 12h6M8 17h8" />
    </>
  ),
  reasoning: (
    <FilledShape>
      <path
        fill="none"
        data-icon-detail="connection"
        d="m6.8 6.8 3.4 3.4m3.6 3.6 3.4 3.4"
      />
      <circle cx="5" cy="5" r="2.5" />
      <circle
        data-icon-detail="node"
        cx="12"
        cy="12"
        r="2.5"
        fill="currentColor"
      />
      <circle cx="19" cy="19" r="2.5" />
    </FilledShape>
  ),
  reasoningFork: (
    <FilledShape>
      <path
        fill="none"
        data-icon-detail="connection"
        d="M12 16.5V11M5 7.5V11h14V7.5"
      />
      <circle cx="5" cy="5" r="2.5" />
      <circle data-icon-detail="node" cx="19" cy="5" r="2.5" />
      <circle cx="12" cy="19" r="2.5" />
    </FilledShape>
  ),
  embedding: (
    <>
      <path d="M3.5 3.5v17h17" />
      <g data-icon-detail="cells" fill="currentColor" stroke="none">
        <circle cx="8" cy="15" r="1.4" />
        <circle cx="11.5" cy="10.5" r="1.4" />
        <circle cx="17" cy="7" r="1.4" />
        <circle cx="18" cy="15" r="1.4" />
        <circle cx="7.5" cy="6" r="1.4" />
      </g>
    </>
  ),
  embeddingVector: (
    <>
      <path d="M3.5 3.5v17h17" />
      <path data-icon-detail="out" d="M7 17 18 6m-5 0h5v5" />
      <path data-icon-detail="row" d="M7 8h3m6 9v-3" />
    </>
  ),
} as const;
