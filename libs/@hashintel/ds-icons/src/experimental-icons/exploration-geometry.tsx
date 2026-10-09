const matrixBrackets = <path d="M6 3H3v18h3M18 3h3v18h-3" />;

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
        <circle cx="9" cy="8" r="1" />
        <circle cx="15" cy="8" r="1" />
        <circle cx="9" cy="16" r="1" />
        <circle cx="15" cy="16" r="1" />
      </g>
    </>
  ),
  matrixGrid: (
    <>
      {matrixBrackets}
      <path data-icon-detail="row" d="M8 7h2m4 0h2M8 12h2m4 0h2M8 17h2m4 0h2" />
    </>
  ),
  probability: (
    <>
      <path d="M3 20h18" />
      <path data-icon-detail="distribution" d="M3 18c5 0 4-14 9-14s4 14 9 14" />
      <path d="M12 16v4" />
    </>
  ),
  probabilityDice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <g data-icon-detail="cells" fill="currentColor" stroke="none">
        <circle cx="8" cy="8" r="1.5" />
        <circle cx="16" cy="8" r="1.5" />
        <circle cx="12" cy="12" r="1.5" />
        <circle cx="8" cy="16" r="1.5" />
        <circle cx="16" cy="16" r="1.5" />
      </g>
    </>
  ),
  expression: (
    <>
      <path data-icon-detail="open-left" d="m6 6-4 6 4 6" />
      <path data-icon-detail="open-right" d="m18 6 4 6-4 6" />
      <path data-icon-detail="notation" d="m9 9 6 6m0-6-6 6" />
    </>
  ),
  expressionTree: (
    <>
      <path d="M12 8v5M5 16v-3h14v3" />
      <circle data-icon-detail="node" cx="12" cy="5" r="3" />
      <rect x="2" y="16" width="6" height="5" rx="1" />
      <rect x="16" y="16" width="6" height="5" rx="1" />
    </>
  ),
  typeVariable: (
    <>
      <path data-icon-detail="notation" d="M3 5h12M9 5v14M6 19h6" />
      <path data-icon-detail="type-mark" d="m16 13 5 7m0-7-5 7" />
    </>
  ),
  typeUnion: (
    <>
      <circle data-icon-detail="open-left" cx="5.5" cy="12" r="3.5" />
      <path d="M12 4v16" />
      <rect
        data-icon-detail="open-right"
        x="16"
        y="8.5"
        width="6"
        height="7"
        rx=".5"
      />
    </>
  ),
  breakpoint: (
    <>
      <path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z" />
      <circle
        data-icon-detail="target"
        cx="12"
        cy="12"
        r="3"
        fill="currentColor"
      />
    </>
  ),
  breakpointLine: (
    <>
      <path d="M9 5h12M9 19h12" />
      <path data-icon-detail="lines" d="M11 12h10" />
      <circle data-icon-detail="target" cx="5" cy="12" r="3" />
    </>
  ),
  testTube: (
    <>
      <path d="m9 3 9 9M11 5 3.5 12.5a4.2 4.2 0 0 0 6 6L17 11" />
      <path data-icon-detail="test-result" d="m14 18 2 2 5-5" />
      <path data-icon-detail="liquid-level" d="M6 12h5" />
    </>
  ),
  testCheck: (
    <>
      <path d="M9 3H5v18h14V3h-4M9 2h6v4H9Z" />
      <path data-icon-detail="test-result" d="m8 13 3 3 5-6" />
    </>
  ),
  agent: (
    <>
      <rect x="4" y="7" width="16" height="14" rx="4" />
      <path data-icon-detail="antenna" d="M12 7V3m-2 0h4" />
      <g data-icon-detail="eyes">
        <path d="M8 12v2m8-2v2" />
      </g>
      <path d="M9 18h6" />
    </>
  ),
  agentOrbit: (
    <>
      <circle cx="12" cy="12" r="4" />
      <g data-icon-detail="orbit">
        <path d="M3 12a9 9 0 0 1 15-6M21 12a9 9 0 0 1-15 6" />
        <circle cx="4" cy="17" r="2" />
        <circle cx="20" cy="7" r="2" />
      </g>
    </>
  ),
  context: (
    <>
      <rect x="7" y="3" width="14" height="16" rx="1.5" />
      <path data-icon-detail="sheet" d="M3 7v14h14" />
      <path data-icon-detail="lines" d="M11 8h6m-6 4h4" />
    </>
  ),
  contextWindow: (
    <>
      <path data-icon-detail="open-left" d="M6 3H3v18h3" />
      <path data-icon-detail="open-right" d="M18 3h3v18h-3" />
      <path data-icon-detail="row" d="M8 7h8M8 12h6M8 17h8" />
    </>
  ),
  reasoning: (
    <>
      <path data-icon-detail="connection" d="M6 7v5h12v5" />
      <circle cx="6" cy="4" r="2.5" />
      <circle
        data-icon-detail="node"
        cx="12"
        cy="12"
        r="2.5"
        fill="currentColor"
      />
      <circle cx="18" cy="20" r="2.5" />
    </>
  ),
  reasoningFork: (
    <>
      <path data-icon-detail="connection" d="M12 17v-6M5 7v4h14V7" />
      <circle cx="5" cy="4" r="2.5" />
      <circle data-icon-detail="node" cx="19" cy="4" r="2.5" />
      <circle cx="12" cy="20" r="2.5" />
    </>
  ),
  embedding: (
    <>
      <path d="M3 3v18h18" />
      <g data-icon-detail="cells" fill="currentColor" stroke="none">
        <circle cx="8" cy="15" r="1.5" />
        <circle cx="11" cy="11" r="1.5" />
        <circle cx="16" cy="8" r="1.5" />
        <circle cx="18" cy="14" r="1.5" />
        <circle cx="8" cy="6" r="1.5" />
      </g>
    </>
  ),
  embeddingVector: (
    <>
      <path d="M3 3v18h18" />
      <path data-icon-detail="out" d="m6 18 12-12m-5 0h5v5" />
      <path data-icon-detail="row" d="M6 9h3M12 18v-3" />
    </>
  ),
} as const;
