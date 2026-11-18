import { CubeGeometry } from "./cube-geometry";
import { FilledShape } from "./filled-shape";

import type { SVGProps } from "react";

const Trace = ({
  layer = "symbol",
  ...props
}: SVGProps<SVGPathElement> & { layer?: string }) => (
  <path pathLength="1" data-icon-draw={layer} {...props} />
);
const Ring = ({
  layer = "symbol",
  ...props
}: SVGProps<SVGCircleElement> & { layer?: string }) => (
  <circle pathLength="1" data-icon-draw={layer} {...props} />
);
const rewindArc = (
  <g data-icon-detail="rewind-ring">
    <Trace layer="frame" d="M6.343 6.343a8 8 0 1 1-2.07 7.727" />
    <Trace layer="arrow" d="M6.343 2.75v3.593h3.593" />
  </g>
);

export const modelingGeometry = {
  clockRotateLeft: (
    <>
      {rewindArc}
      <g data-icon-detail="rewind-hand">
        <Trace layer="hands" d="M12 7.75V12l3 1.75" />
      </g>
    </>
  ),
  reset: rewindArc,
  cube: <CubeGeometry />,
  differentialEquation: (
    <>
      <g data-icon-detail="derivative-top">
        <Trace
          layer="numerator"
          d="M14.25 2.5v6.75M14.25 6.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 1 0 5 0"
        />
      </g>
      <Trace layer="fraction" d="M4.5 12h15" />
      <g data-icon-detail="derivative-bottom">
        <Trace
          layer="denominator"
          d="M10.5 14.75v6.75M10.5 19a2.5 2.5 0 1 0-5 0 2.5 2.5 0 1 0 5 0"
        />
        <Trace
          layer="time"
          d="M16 14.75V19.75c0 1.25.5 1.75 2 1.75h1M13.5 17.5H20"
        />
      </g>
    </>
  ),
  equationCurve: (
    <>
      <Trace layer="axes" d="M3.5 3.5v17h17" />
      <Trace
        layer="curve"
        data-icon-detail="equation-curve"
        d="M6.5 17.5C11 17.5 11 7 20.5 5.5"
      />
      <g data-icon-detail="curve-sample">
        <Ring
          layer="sample"
          cx="11.625"
          cy="12.0625"
          r="1.4"
          fill="currentColor"
          stroke="none"
        />
      </g>
    </>
  ),
  equationFlow: (
    <>
      <g data-icon-detail="slope-field" opacity=".5">
        <Trace
          layer="field"
          d="m4 5 2-1m5 3 2-2m5 0 2-2M4 20l2 1m5-2h2m5-2 2-1"
        />
      </g>
      <Trace
        layer="solution"
        data-icon-detail="equation-solution"
        d="M3 16.5C10 18 12 9 20.5 8"
      />
      <Trace layer="arrow" d="m17 5.5 3.5 2.5-2.5 3.5" />
    </>
  ),
  parameterDial: (
    <>
      <Trace
        layer="scale"
        d="M6 18a8.5 8.5 0 1 1 12 0M12 3.5v2M4.65 7.75l1.75 1M19.35 7.75l-1.75 1"
      />
      <g data-icon-detail="dial-needle">
        <Trace layer="needle" d="m12 14 4-6" />
      </g>
      <Ring layer="pivot" cx="12" cy="14" r="1.5" />
      <Trace layer="base" d="M9 21h6" />
    </>
  ),
  parameterRange: (
    <>
      <Trace layer="track" d="M3 12h18" opacity=".35" />
      <g data-icon-detail="range-left">
        <Trace layer="lower" d="M6 7v10" />
      </g>
      <g data-icon-detail="range-right">
        <Trace layer="upper" d="M18 7v10" />
      </g>
      <Trace layer="value" data-icon-detail="range-value" d="M6 12h12" />
    </>
  ),
  variable: (
    <>
      <g data-icon-detail="variable-left">
        <Trace layer="first-stroke" d="M7 5.5 17 18.5" />
      </g>
      <g data-icon-detail="variable-right">
        <Trace layer="second-stroke" d="M17 5.5 7 18.5" />
      </g>
    </>
  ),
  variableBrackets: (
    <>
      <Trace layer="left-bound" data-icon-detail="open-left" d="M6 4H3v16h3" />
      <Trace
        layer="right-bound"
        data-icon-detail="open-right"
        d="M18 4h3v16h-3"
      />
      <g data-icon-detail="variable-value">
        <Trace layer="value" d="m9 8 6 8m0-8-6 8" />
      </g>
    </>
  ),
  variableRegister: (
    <FilledShape
      cutout={
        <>
          <g data-icon-detail="variable-value">
            <Trace layer="value" d="m7 8 6 8m0-8-6 8" />
          </g>
          <Trace layer="cursor" data-icon-detail="value-cursor" d="M17 8v8" />
        </>
      }
    >
      <Trace
        layer="container"
        d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
      />
    </FilledShape>
  ),
  tokenType: (
    <FilledShape>
      {" "}
      <>
        <g data-icon-detail="token-top">
          <Ring layer="first-token" cx="12" cy="6.75" r="3.25" />
        </g>
        <g data-icon-detail="token-left">
          <Ring layer="second-token" cx="6.5" cy="16.5" r="3.25" />
        </g>
        <g data-icon-detail="token-right">
          <Ring layer="third-token" cx="17.5" cy="16.5" r="3.25" />
        </g>
      </>
    </FilledShape>
  ),
  tokenTypeStack: (
    <FilledShape>
      {" "}
      <>
        <g data-icon-detail="token-stack-top">
          <Trace layer="top-token" d="M4 7a8 3 0 1 0 16 0a8 3 0 1 0-16 0Z" />
        </g>
        <Trace
          fill="none"
          layer="middle-token"
          data-icon-detail="token-stack-middle"
          d="M4 12c0 4 16 4 16 0"
        />
        <Trace fill="none" layer="bottom-token" d="M4 17c0 4 16 4 16 0" />
      </>
    </FilledShape>
  ),
  tokenTypeTag: (
    <FilledShape
      cutout={
        <>
          <Ring layer="eyelet" cx="8" cy="8" r=".75" />
          <g data-icon-detail="tag-token">
            <Ring layer="token" cx="13.5" cy="13.5" r="2.5" />
          </g>
        </>
      }
    >
      <Trace layer="tag" d="M4 4h8l9 9-8 8-9-9Z" />
    </FilledShape>
  ),
  subnetNetwork: (
    <FilledShape>
      <Trace fill="none" layer="boundary" d="M6 3H3v18h3M18 3h3v18h-3" />
      <Trace
        fill="none"
        layer="connections"
        data-icon-detail="subnet-link"
        d="m8.5 9.5 3.5 3 3.5-3M12 12.5V16"
      />
      <g data-icon-detail="subnet-node">
        <Ring layer="places" cx="7" cy="8" r="2" />
        <Ring layer="places" cx="17" cy="8" r="2" />
      </g>
      <Trace layer="transition" d="M9.5 16h5v4.5h-5Z" />
    </FilledShape>
  ),
  subnetLayers: (
    <>
      <Trace layer="back-module" d="M8 3h11a2 2 0 0 1 2 2v11" />
      <g data-icon-detail="module-front">
        <FilledShape cutout={<Trace layer="ports" d="M7 14h6M10 11v6" />}>
          <Trace
            layer="front-module"
            d="M5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
          />
        </FilledShape>
      </g>
    </>
  ),
} as const;
