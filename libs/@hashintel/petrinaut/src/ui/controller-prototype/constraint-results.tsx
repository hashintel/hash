import { use, useId, useRef, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  firstCheck,
  subjectUnit,
} from "../../react/controller-prototype/constraints";
import { EditorContext } from "../../react/state/editor-context";
import { SDCPNContext } from "../../react/state/sdcpn-context";
import {
  EXAMPLE_DATA_NOTE,
  exampleResultFor,
  exampleResultHeld,
  exampleSeries,
} from "./constraint-results-example";
import { openFailingRuns } from "./failing-runs-view";

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
const plotTop = 20;
const plotBottom = 96;
const bandTop = 18;
const readoutGap = 8;
const maxDay = 360;
const labelHeight = 14;
const readoutHeight = 20;

const x = (day: number) => (stripWidth * day) / maxDay;
const percent = (day: number) => `${(day / maxDay) * 100}%`;

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

const valueAt = (points: SeriesPoint[], day: number): number => {
  let value = points[0]?.value ?? 0;
  for (const point of points) {
    if (point.day > day) {
      break;
    }
    value = point.value;
  }
  return value;
};

const formatValue = (value: number): string =>
  String(Number(value.toPrecision(2)));

const strokeVar = (token: string) => `var(--colors-neutral-${token})`;

const plotStyle = css({
  position: "relative",
  width: "full",
  cursor: "crosshair",
});

const plotSvgStyle = css({
  display: "block",
  width: "full",
  overflow: "visible",
});

const labelStyle = css({
  position: "absolute",
  fontSize: "[11px]",
  lineHeight: "[14px]",
  color: "neutral.s100",
  whiteSpace: "nowrap",
  pointerEvents: "none",
});

const scrubLineStyle = css({
  position: "absolute",
  width: "[1px]",
  backgroundColor: "blue.s90",
  pointerEvents: "none",
});

const scrubDotStyle = css({
  position: "absolute",
  width: "[7px]",
  height: "[7px]",
  borderRadius: "full",
  backgroundColor: "blue.s90",
  transform: "translate(-50%, -50%)",
  pointerEvents: "none",
});

const readoutStyle = css({
  position: "absolute",
  fontSize: "[11px]",
  lineHeight: "[14px]",
  color: "neutral.s00",
  backgroundColor: "neutral.s120",
  borderRadius: "md",
  paddingX: "2",
  paddingY: "[3px]",
  whiteSpace: "nowrap",
  pointerEvents: "none",
});

type Scrub = {
  day: number;
  pillLeft: number;
  pillTop: number;
  lineTop: number;
};

type Box = { left: number; right: number; top: number; bottom: number };

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The checked value over the first failing run, against its limit and window. */
const FailureStrip: React.FC<{
  constraint: ModelConstraint;
  result: ConstraintResult;
}> = ({ constraint, result }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const clipId = useId();
  const readoutRef = useRef<HTMLDivElement>(null);
  const limitLabelRef = useRef<HTMLSpanElement>(null);
  const [scrub, setScrub] = useState<Scrub | null>(null);
  const check = firstCheck(constraint.checks);
  const limit = check?.bound ?? 0;
  const unit = subjectUnit(petriNetDefinition, check?.subject ?? null);
  const withUnit = (text: string) => (unit ? `${text} ${unit}` : text);
  const top = limit * 1.5;
  const y = (value: number) =>
    plotBottom - ((plotBottom - plotTop) * Math.min(value, top)) / top;
  const points = exampleSeries(constraint, result, limit);
  const window = constraint.window;
  const windowFrom = window?.kind === "between" ? window.from : 0;
  const limitY = y(limit);
  const path = stepPath(points, y);
  const overIsRed = check?.op !== "above";
  const aboveLimit = { y: 0, height: limitY };
  const belowLimit = { y: limitY, height: stripHeight - limitY };
  const redClip = overIsRed ? aboveLimit : belowLimit;
  const darkClip = overIsRed ? belowLimit : aboveLimit;

  const scrubTo = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(
      1,
      Math.max(0, (event.clientX - box.left) / box.width),
    );
    const width = box.width;
    const pillWidth = readoutRef.current?.offsetWidth ?? 0;
    const pointerX = fraction * width;
    const day = Math.round(fraction * maxDay);
    const dotY = y(valueAt(points, day));
    const px = (days: number) => (days / maxDay) * width;

    const over = points.flatMap((point, index) =>
      (overIsRed ? point.value > limit : point.value < limit)
        ? [{ point, end: points[index + 1]?.day ?? maxDay }]
        : [],
    );
    const obstacles: Box[] = [
      {
        left: width - (limitLabelRef.current?.offsetWidth ?? 0),
        right: width,
        top: limitY - 3 - labelHeight,
        bottom: limitY - 3,
      },
      {
        left: px(result.firstBreak.day) - 1,
        right: px(result.firstBreak.day) + 1,
        top: bandTop,
        bottom: plotBottom,
      },
    ];
    if (over.length > 0) {
      const ys = [limitY, ...over.map(({ point }) => y(point.value))];
      obstacles.push({
        left: px(over[0]!.point.day),
        right: px(over[over.length - 1]!.end),
        top: Math.min(...ys),
        bottom: Math.max(...ys),
      });
    }

    const lefts = [
      pointerX + readoutGap,
      pointerX - readoutGap - pillWidth,
    ].filter((left) => left >= 0 && left + pillWidth <= width);
    const tops = [dotY - readoutGap - readoutHeight, dotY + readoutGap];
    const spots = tops.flatMap((pillTop) =>
      lefts.map((left) => ({ left, top: pillTop })),
    );
    const clear = (spot: { left: number; top: number }) =>
      spot.top >= 0 &&
      spot.top + readoutHeight <= stripHeight &&
      !obstacles.some((obstacle) =>
        overlaps(
          {
            left: spot.left,
            right: spot.left + pillWidth,
            top: spot.top,
            bottom: spot.top + readoutHeight,
          },
          obstacle,
        ),
      );
    const spot = spots.find(clear) ?? {
      left: Math.min(width - pillWidth, Math.max(0, pointerX + readoutGap)),
      top: tops[1]!,
    };
    const limitLabelLeft = obstacles[0]!.left;
    setScrub({
      day,
      pillLeft: spot.left,
      pillTop: spot.top,
      lineTop: pointerX >= limitLabelLeft ? limitY - 2 : bandTop,
    });
  };

  const scrubValue = scrub ? valueAt(points, scrub.day) : 0;
  const scrubY = y(scrubValue);

  return (
    <div
      className={plotStyle}
      style={{ height: stripHeight }}
      role="img"
      aria-label={`Example: ${constraint.name}, first failing run`}
      onPointerMove={scrubTo}
      onPointerLeave={() => setScrub(null)}
    >
      <svg
        className={plotSvgStyle}
        viewBox={`0 0 ${stripWidth} ${stripHeight}`}
        preserveAspectRatio="none"
        height={stripHeight}
      >
        <defs>
          <clipPath id={`${clipId}-red`}>
            <rect x={0} width={stripWidth} {...redClip} />
          </clipPath>
          <clipPath id={`${clipId}-dark`}>
            <rect x={0} width={stripWidth} {...darkClip} />
          </clipPath>
        </defs>
        {window ? (
          <rect
            x={x(windowFrom)}
            y={bandTop}
            width={x(window.to) - x(windowFrom)}
            height={plotBottom - bandTop}
            fill={strokeVar("s20")}
          />
        ) : null}
        <line
          x1={0}
          x2={stripWidth}
          y1={plotBottom}
          y2={plotBottom}
          stroke={strokeVar("s60")}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={0}
          x2={stripWidth}
          y1={limitY}
          y2={limitY}
          stroke={strokeVar("s90")}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path}
          fill="none"
          stroke={strokeVar("s120")}
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          clipPath={`url(#${clipId}-dark)`}
        />
        <path
          d={path}
          fill="none"
          stroke="var(--colors-red-s100)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          clipPath={`url(#${clipId}-red)`}
        />
        <line
          x1={x(result.firstBreak.day)}
          x2={x(result.firstBreak.day)}
          y1={bandTop}
          y2={plotBottom}
          stroke={strokeVar("s70")}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className={labelStyle}
        style={{
          left: `calc(${percent(result.firstBreak.day)} + 4px)`,
          top: 0,
        }}
      >
        {`day ${result.firstBreak.day}`}
      </span>
      <span
        ref={limitLabelRef}
        className={labelStyle}
        style={{ right: 0, top: limitY - 3 - labelHeight }}
      >
        {withUnit(String(limit))}
      </span>
      <span className={labelStyle} style={{ left: 0, top: plotBottom + 3 }}>
        0
      </span>
      {window ? (
        <span
          className={labelStyle}
          style={{
            left: percent(windowFrom),
            top: plotBottom + 3,
            transform: "translateX(-50%)",
          }}
        >
          {windowFrom}
        </span>
      ) : null}
      <span className={labelStyle} style={{ right: 0, top: plotBottom + 3 }}>
        {maxDay} days
      </span>
      {scrub ? (
        <>
          <span
            className={scrubLineStyle}
            style={{
              left: percent(scrub.day),
              top: scrub.lineTop,
              height: plotBottom - scrub.lineTop,
            }}
          />
          <span
            className={scrubDotStyle}
            style={{ left: percent(scrub.day), top: scrubY }}
          />
        </>
      ) : null}
      <div
        ref={readoutRef}
        className={readoutStyle}
        style={{
          left: scrub?.pillLeft ?? 0,
          top: scrub?.pillTop ?? 0,
          visibility: scrub ? "visible" : "hidden",
        }}
      >
        {`day ${scrub?.day ?? 0} · ${withUnit(formatValue(scrubValue))}`}
      </div>
    </div>
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
        onClick={() =>
          failing > 0 ? openFailingRuns() : setGlobalMode("simulate")
        }
      >
        {failing > 0 ? `Open ${failing} failing runs` : "Open in timeline"}
      </Button>
    </div>
  );
};
