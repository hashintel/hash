import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { subjectUnit } from "../../react/controller-prototype/constraints";
import { EditorContext } from "../../react/state/editor-context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import {
  EXAMPLE_DATA_NOTE,
  exampleResultFor,
  exampleResultHeld,
  exampleSeries,
} from "./constraint-results-example";

import type { ModelConstraint } from "../../react/controller-prototype/constraints";
import type {
  ConstraintResult,
  SeriesPoint,
} from "./constraint-results-example";

const headingRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  flexWrap: "wrap",
  gap: "2",
  marginBottom: "2",
});

const headingStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "neutral.s120",
});

const mutedStyle = css({ fontSize: "xs", color: "neutral.s100" });

const exampleTagStyle = css({
  fontSize: "[11px]",
  lineHeight: "[16px]",
  fontWeight: "medium",
  color: "neutral.s100",
  backgroundColor: "neutral.s20",
  borderRadius: "md",
  paddingX: "1.5",
});

const statusStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  fontSize: "sm",
  color: "neutral.s120",
  backgroundColor: "neutral.s20",
  borderRadius: "md",
  paddingX: "2",
  paddingY: "1.5",
});

const violatedStyle = css({ fontWeight: "medium", color: "red.s100" });

const runLineStyle = css({
  display: "flex",
  alignItems: "baseline",
  gap: "2",
  marginTop: "3",
  fontSize: "xs",
  color: "neutral.s120",
});

const linkStyle = css({
  marginTop: "1",
  "&&": { fontWeight: "[400]", color: "blue.s110" },
});

const noResultsStyle = css({ fontSize: "sm", color: "neutral.s100" });

const noResultsLinkStyle = css({
  marginTop: "2.5",
  "&&": { fontWeight: "[400]", color: "blue.s110" },
});

const stripWidth = 400;
const stripHeight = 116;
const plotLeft = 4;
const plotRight = 396;
const plotTop = 20;
const plotBottom = 96;
const maxDay = 360;

const x = (day: number) =>
  plotLeft + ((plotRight - plotLeft) * day) / maxDay;

const stepPath = (points: SeriesPoint[], y: (value: number) => number) => {
  let path = "";
  points.forEach((point, index) => {
    const previous = points[index - 1];
    path += index === 0 ? `M${x(point.day)} ${y(point.value)}` : "";
    if (previous) {
      path += ` H${x(point.day)} V${y(point.value)}`;
    }
  });
  const last = points[points.length - 1];
  return last ? `${path} H${x(maxDay)}` : path;
};

const strokeVar = (token: string) => `var(--colors-neutral-${token})`;

/** The checked value over the first failing run, against its limit and window. */
const FailureStrip: React.FC<{
  constraint: ModelConstraint;
  result: ConstraintResult;
}> = ({ constraint, result }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const check = constraint.checks[0];
  const limit = check?.bound ?? 0;
  const unit =
    subjectUnit(petriNetDefinition, check?.subject ?? null) ?? "tokens";
  const top = limit * 1.5;
  const y = (value: number) =>
    plotBottom - ((plotBottom - plotTop) * Math.min(value, top)) / top;
  const points = exampleSeries(constraint, result, limit);
  const window = constraint.window;
  const windowFrom = window?.kind === "between" ? window.from : 0;
  const breakX = x(result.firstBreak.day);

  return (
    <svg
      viewBox={`0 0 ${stripWidth} ${stripHeight}`}
      width="100%"
      role="img"
      aria-label={`Example: ${constraint.name}, first failing run`}
    >
      {window ? (
        <rect
          x={x(windowFrom)}
          y={plotTop - 8}
          width={x(window.to) - x(windowFrom)}
          height={plotBottom - plotTop + 8}
          fill={strokeVar("s20")}
        />
      ) : null}
      <line
        x1={plotLeft}
        x2={plotRight}
        y1={plotBottom}
        y2={plotBottom}
        stroke={strokeVar("s60")}
      />
      <line
        x1={plotLeft}
        x2={plotRight}
        y1={y(limit)}
        y2={y(limit)}
        stroke={strokeVar("s90")}
        strokeDasharray="3 3"
      />
      <path
        d={stepPath(points, y)}
        fill="none"
        stroke={strokeVar("s120")}
        strokeWidth="1.2"
      />
      <line
        x1={breakX}
        x2={breakX}
        y1={plotTop - 8}
        y2={plotBottom}
        stroke={strokeVar("s120")}
      />
      <g fontSize="11" fill={strokeVar("s100")}>
        <text x={breakX + 4} y={plotTop - 7}>
          {`step ${result.firstBreak.step} · day ${result.firstBreak.day}`}
        </text>
        <text x={plotRight} y={y(limit) - 3} textAnchor="end">
          {`${limit} ${unit}`}
        </text>
        <text x={plotLeft} y={111}>
          0
        </text>
        {window ? (
          <text x={x(windowFrom)} y={111}>
            {windowFrom}
          </text>
        ) : null}
        <text x={x(maxDay) - 38} y={111} textAnchor="end">
          {maxDay}
        </text>
        <text x={plotRight} y={111} textAnchor="end">
          days
        </text>
      </g>
    </svg>
  );
};

const noteStyle = css({ display: "contents" });

/**
 * The "Last experiment" section: the example results for a constraint, or
 * the one next step when it has none. Opening the timeline and creating an
 * experiment both go to Simulate mode.
 */
export const LastExperiment: React.FC<{ constraint: ModelConstraint }> = ({
  constraint,
}) => {
  const { setGlobalMode } = use(EditorContext);
  const result = exampleResultFor(constraint.id);

  if (!result) {
    return (
      <div>
        <div className={headingRowStyle}>
          <span className={headingStyle}>Last experiment</span>
        </div>
        <div className={noResultsStyle}>No results yet</div>
        <Button
          size="sm"
          variant="link"
          tone="brand"
          className={noResultsLinkStyle}
          onClick={() => setGlobalMode("simulate")}
        >
          Create experiment
        </Button>
      </div>
    );
  }

  const failing = result.runs - result.held;
  const held = exampleResultHeld(result, constraint.tolerance);

  return (
    <div>
      <div className={headingRowStyle}>
        <span className={headingStyle}>Last experiment</span>
        <span className={mutedStyle}>
          {result.experiment} · {result.runs} runs
        </span>
        <span className={exampleTagStyle} title={EXAMPLE_DATA_NOTE}>
          Example data
        </span>
      </div>
      <div className={statusStyle}>
        {held ? null : <Icon name="warning" size="xs" />}
        <span className={noteStyle}>
          {held ? (
            <>Held in {result.held}</>
          ) : (
            <>
              <span className={violatedStyle}>Violated</span> · held in{" "}
              {result.held}
            </>
          )}{" "}
          of {result.runs} runs · needs {constraint.tolerance}%
        </span>
      </div>
      {failing > 0 ? (
        <>
          <div className={runLineStyle}>
            <span>Run {result.firstFailingRun}</span>
            <span className={mutedStyle}>first failing run of {failing}</span>
          </div>
          <FailureStrip constraint={constraint} result={result} />
        </>
      ) : null}
      <Button
        size="sm"
        variant="link"
        tone="brand"
        className={linkStyle}
        onClick={() => setGlobalMode("simulate")}
      >
        Open in timeline
      </Button>
    </div>
  );
};
