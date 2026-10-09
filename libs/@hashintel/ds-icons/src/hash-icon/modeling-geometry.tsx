import { projectCube } from "./shared/cube-projection";

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
  cube: (
    <g data-icon-cube="" data-cube-angle="35">
      {projectCube(35).map((edge) => (
        <Trace
          key={edge.index}
          layer={`edge-${edge.index}`}
          data-cube-edge={edge.index}
          d={edge.path}
          visibility={edge.visible ? "visible" : "hidden"}
        />
      ))}
    </g>
  ),
  differentialEquation: (
    <>
      <g data-icon-detail="derivative-top">
        <Trace layer="numerator" d="M14 3v6m0-3a3 3 0 1 0 0 3" />
      </g>
      <Trace layer="fraction" d="M5 12h14" />
      <g data-icon-detail="derivative-bottom">
        <Trace layer="denominator" d="M10 15v6m0-3a3 3 0 1 0 0 3" />
        <Trace layer="time" d="M16 15v5q0 1 2 1m-4-4h5" />
      </g>
    </>
  ),
  equationCurve: (
    <>
      <Trace layer="axes" d="M4 4v16h17" />
      <Trace
        layer="curve"
        data-icon-detail="equation-curve"
        d="M6 17C11 17 10 7 19 6"
      />
      <g data-icon-detail="curve-sample">
        <Ring
          layer="sample"
          cx="12"
          cy="11.5"
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
          d="m4 6 2-1m4 2 2-2m5 1 1-2M4 13h2m4 0 2-1m5 0 2-2M4 20l2 1m4-1h2m5 0 2-1"
        />
      </g>
      <Trace
        layer="solution"
        data-icon-detail="equation-solution"
        d="M3 17C9 19 12 10 21 8"
      />
    </>
  ),
  parameterDial: (
    <>
      <Trace
        layer="scale"
        d="M5 19a9 9 0 1 1 14 0M12 3v2M4.2 7.5l1.7 1M19.8 7.5l-1.7 1"
      />
      <g data-icon-detail="dial-needle">
        <Trace layer="needle" d="M12 14l4-6" />
      </g>
      <Ring layer="pivot" cx="12" cy="14" r="1.5" />
      <Trace layer="base" d="M9 21h6" />
    </>
  ),
  parameterRange: (
    <>
      <Trace layer="track" d="M3 7h18M3 17h18" opacity=".35" />
      <g data-icon-detail="range-left">
        <Trace layer="lower" d="M7 4v6m0 4v6" />
      </g>
      <g data-icon-detail="range-right">
        <Trace layer="upper" d="M16 4v6m0 4v6" />
      </g>
      <Trace layer="value" data-icon-detail="range-value" d="M10 12h3" />
    </>
  ),
  variable: (
    <>
      <g data-icon-detail="variable-left">
        <Trace layer="first-stroke" d="M6 6h1.5c3 0 4 12 7 12H18" />
      </g>
      <g data-icon-detail="variable-right">
        <Trace layer="second-stroke" d="M18 6h-1.5c-3 0-4 12-7 12H6" />
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
    <>
      <Trace
        layer="container"
        d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
      />
      <g data-icon-detail="variable-value">
        <Trace layer="value" d="m7 8 6 8m0-8-6 8" />
      </g>
      <Trace layer="cursor" data-icon-detail="value-cursor" d="M17 8v8" />
    </>
  ),
  tokenType: (
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
  ),
  tokenTypeStack: (
    <>
      <g data-icon-detail="token-stack-top">
        <Trace layer="top-token" d="M4 7a8 3 0 1 0 16 0a8 3 0 1 0-16 0Z" />
      </g>
      <Trace
        layer="middle-token"
        data-icon-detail="token-stack-middle"
        d="M4 12c0 4 16 4 16 0"
      />
      <Trace layer="bottom-token" d="M4 17c0 4 16 4 16 0" />
    </>
  ),
  tokenTypeTag: (
    <>
      <Trace layer="tag" d="M4 4h8l9 9-8 8-9-9Z" />
      <Ring layer="eyelet" cx="8" cy="8" r=".75" />
      <g data-icon-detail="tag-token">
        <Ring layer="token" cx="13.5" cy="13.5" r="2.5" />
      </g>
    </>
  ),
  subnetNetwork: (
    <>
      <Trace
        layer="boundary"
        d="M7 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h2M17 3h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2"
      />
      <Trace
        layer="connections"
        data-icon-detail="subnet-link"
        d="m8.6 9.2 3.4 2.8 3.4-2.8M12 12v4"
      />
      <g data-icon-detail="subnet-node">
        <Ring layer="places" cx="7" cy="8" r="2" />
        <Ring layer="places" cx="17" cy="8" r="2" />
      </g>
      <Trace layer="transition" d="M10 16h4v4h-4Z" />
    </>
  ),
  subnetLayers: (
    <>
      <Trace layer="back-module" d="M8 3h11a2 2 0 0 1 2 2v11" />
      <g data-icon-detail="module-front">
        <Trace
          layer="front-module"
          d="M5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
        />
        <Trace layer="ports" d="M7 14h6M10 11v6" />
      </g>
    </>
  ),
} as const;
