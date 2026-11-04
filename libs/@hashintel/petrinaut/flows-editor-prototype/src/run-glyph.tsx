/**
 * Run marks, decided 4 Nov ("run marks B"): a state glyph for steps that run once, a segmented bar along the card's
 * bottom edge for steps inside a For each. No colour dots. Blue = in progress, orange = needs review; the colours
 * are matched by how strong they look (`status-colors.ts`). Every mark has a tooltip with its state and detail.
 *
 * The glyphs follow the local Figma set 1196:88872. DS gap: ds-components has no run-state icons (no filled
 * check-circle, no half-filled ring), so they are drawn here.
 */
import { Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { barColor, statusColor } from "./status-colors";

import type { BarSegment, StepState } from "./run-history";

const green = statusColor.done;
const red = statusColor.failed;
const blue = statusColor.running;
const orange = statusColor.review;
const grey = statusColor.quiet;
const ring = statusColor.notReached;
const white = statusColor.onSolid;

const Tick = () => (
  <path
    d="M3.6 6.2 5.2 7.8 8.4 4.4"
    fill="none"
    stroke={white}
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

const glyphLabel: Record<StepState, string> = {
  notReached: "Not reached",
  running: "Running",
  done: "Done",
  failed: "Failed",
  needsReview: "Needs review",
  skipped: "Skipped",
  abandoned: "Abandoned",
  doneWithFailures: "Partly done",
};

/** The counts behind a mark, for its tooltip: "18 of 20 · 2 failed". */
const progressDetail = (state: StepState, progress?: GlyphProgress) => {
  if (!progress || progress.total <= 1) {
    return undefined;
  }
  const { done, failed, total } = progress;
  const failedPart = failed > 0 ? ` · ${failed} failed` : "";
  switch (state) {
    case "done":
    case "doneWithFailures": {
      const skipped = total - done - failed;
      return `${done} of ${total}${failedPart}${skipped > 0 ? ` · ${skipped} skipped` : ""}`;
    }
    case "running":
    case "abandoned":
      return `${done} of ${total}${failedPart}`;
    default:
      return undefined;
  }
};

/** A mark's hover text: the state, then what it adds. "Done · 18 of 18", "Failed · Timed out after 48 h". */
export const glyphTooltip = (
  state: StepState,
  progress?: GlyphProgress,
  detail?: string,
) => {
  const extra = detail ?? progressDetail(state, progress);
  return extra ? `${glyphLabel[state]} · ${extra}` : glyphLabel[state];
};

/**
 * Which glyph set draws the marks, for comparison while Aakarsh decides (4 Nov):
 * - `bare` (default, picked 4 Nov): family F3 from icons/status/families/F3, the mark with no ring.
 * - `old`: the filled 12 px set below (Figma 1196:88872).
 * - `new`: the outline set from ops/projects/flows-editor/icons/status (16 px grid, 1.25 stroke, one ring, tick and
 *   cross in one 5 px box). Partly done is a progress arc that closes into done.
 * - `filled`: `new`, with the filled done disc and pie from icons/status/alt-filled.
 *
 * Pick: ?glyphs=bare (F3, the default)|old|new|filled, from the URL only.
 */
export type GlyphSet = "bare" | "old" | "new" | "filled";

const isGlyphSet = (value: string | null): value is GlyphSet =>
  value === "bare" || value === "old" || value === "new" || value === "filled";

/**
 * F3 (`bare`) unless the URL asks for another set. Not remembered: a comparison must never stick, or screens keep
 * showing a superseded set after the pick (drift, 4 Nov).
 */
const readGlyphSet = (): GlyphSet => {
  const fromQuery = new URLSearchParams(globalThis.location.search).get(
    "glyphs",
  );
  return isGlyphSet(fromQuery) ? fromQuery : "bare";
};

export const glyphSet: GlyphSet = readGlyphSet();

// The outline set's geometry, from icons/status/src/gen_glyphs.py.
const R = 6.5;
const SW = 1.25;
const capDeg = ((SW / 2 / R) * 180) / Math.PI;
const segGapDeg = ((0.6 / R) * 180) / Math.PI;
const minFailDeg = ((2.5 / R) * 180) / Math.PI;
const pieR = (R + SW / 2) / 2;
const pieC = 2 * Math.PI * pieR;
const tickD = "M5.75 8.85 L7.65 10.75 L10.75 5.75";

/** A clockwise arc on the ring, in degrees from 12 o'clock. */
const arc = (start: number, end: number) => {
  const point = (deg: number) => {
    const t = ((deg - 90) * Math.PI) / 180;
    return `${(8 + R * Math.cos(t)).toFixed(3)} ${(8 + R * Math.sin(t)).toFixed(3)}`;
  };
  const large = end - start > 180 ? 1 : 0;
  return `M${point(start)} A${R} ${R} 0 ${large} 1 ${point(end)}`;
};

export type GlyphProgress = { done: number; failed: number; total: number };

const OutlineGlyph = ({
  state,
  progress,
  filled,
}: {
  state: StepState;
  progress: GlyphProgress;
  filled: boolean;
}) => {
  const ring = <circle cx="8" cy="8" r={R} />;
  const track = <circle cx="8" cy="8" r={R} opacity="0.25" />;
  const onFill = { stroke: white };
  const failStyle = { stroke: red };
  switch (state) {
    case "notReached":
      return (
        <circle
          cx="8"
          cy="8"
          r={R}
          strokeDasharray="1.3 3.805"
          strokeDashoffset="0.65"
          transform="rotate(-90 8 8)"
        />
      );
    case "running":
      return (
        <>
          {track}
          <path d="M8 1.5 A6.5 6.5 0 0 1 14.401 9.129" />
        </>
      );
    case "done":
      return filled ? (
        <>
          <circle
            cx="8"
            cy="8"
            r={R + SW / 2}
            fill="currentColor"
            stroke="none"
          />
          <path d={tickD} style={onFill} />
        </>
      ) : (
        <>
          {ring}
          <path d={tickD} />
        </>
      );
    case "failed":
      return (
        <>
          {ring}
          <path d="M5.5 5.5 L10.5 10.5 M10.5 5.5 L5.5 10.5" />
        </>
      );
    case "needsReview":
      return (
        <>
          {ring}
          <path d="M8 5V8.25" />
          <path d="M8 10.75h.01" strokeWidth="1.6" />
        </>
      );
    case "skipped":
      return (
        <>
          {ring}
          <path d="M10.5 5.5 L5.5 10.5" />
        </>
      );
    case "abandoned":
      return (
        <>
          {ring}
          <rect
            x="6.5"
            y="6.5"
            width="3"
            height="3"
            rx="0.4"
            fill="currentColor"
          />
        </>
      );
    case "doneWithFailures": {
      const { done, failed, total } = progress;
      if (done >= total) {
        return (
          <OutlineGlyph state="done" progress={progress} filled={filled} />
        );
      }
      if (filled) {
        const common = {
          cx: 8,
          cy: 8,
          r: pieR,
          strokeWidth: pieR * 2,
          strokeLinecap: "butt" as const,
          transform: "rotate(-90 8 8)",
        };
        return (
          <>
            {ring}
            {done > 0 && (
              <circle
                {...common}
                strokeDasharray={`${(pieC * done) / total} ${pieC}`}
              />
            )}
            {failed > 0 && (
              <circle
                {...common}
                strokeDasharray={`${(pieC * failed) / total} ${pieC}`}
                strokeDashoffset={(-pieC * done) / total}
                style={failStyle}
              />
            )}
          </>
        );
      }
      const doneEnd = (360 * done) / total;
      const failEnd = (360 * (done + failed)) / total;
      const failStart = failed
        ? Math.min(doneEnd, failEnd - minFailDeg)
        : doneEnd;
      const arcEnd = failed ? failStart - segGapDeg : doneEnd;
      return (
        <>
          {track}
          {done > 0 && <path d={arc(capDeg, arcEnd - capDeg)} />}
          {failed > 0 && (
            <path
              d={arc(failStart + capDeg, failEnd - capDeg)}
              style={failStyle}
            />
          )}
        </>
      );
    }
  }
};

// The bare set (family F3, icons/status/families/F3, picked 4 Nov): marks with no ring; running and partly done
// draw on a small faint ring.
const bareR = 4;
/** F3 is drawn for 16 px (a 1.25 px stroke); smaller, the bare tick drops under 5 px. */
const bareMinSize = 16;
const bareCap = ((SW / 2 / bareR) * 180) / Math.PI;
const bareGap = ((0.6 / bareR) * 180) / Math.PI;
const bareMinFail = ((2.5 / bareR) * 180) / Math.PI;

const bareArc = (start: number, end: number) => {
  const point = (deg: number) => {
    const t = ((deg - 90) * Math.PI) / 180;
    return `${(8 + bareR * Math.cos(t)).toFixed(3)} ${(8 + bareR * Math.sin(t)).toFixed(3)}`;
  };
  const large = end - start > 180 ? 1 : 0;
  return `M${point(start)} A${bareR} ${bareR} 0 ${large} 1 ${point(end)}`;
};

const BareGlyph = ({
  state,
  progress,
}: {
  state: StepState;
  progress: GlyphProgress;
}) => {
  const track = <circle cx="8" cy="8" r={bareR} opacity="0.25" />;
  switch (state) {
    case "notReached":
      return (
        <circle
          cx="8"
          cy="8"
          r={bareR}
          strokeDasharray="0.01 3.13"
          transform="rotate(-90 8 8)"
        />
      );
    case "running":
      return showsProgress(state, progress) ? (
        <BareGlyph state="doneWithFailures" progress={progress} />
      ) : (
        <>
          {track}
          <path d="M8 4 A4 4 0 0 1 11.939 8.695" />
        </>
      );
    case "done":
      return <path d="M5.125 9 L7.5 11.375 L11.375 5.125" />;
    case "failed":
      return (
        <path d="M4.875 4.875 L11.125 11.125 M11.125 4.875 L4.875 11.125" />
      );
    case "needsReview":
      return (
        <>
          <path d="M8 4.5V8.5" />
          <path d="M8 11.25h.01" strokeWidth="1.6" />
        </>
      );
    case "skipped":
      return <path d="M10.75 5.25 L5.25 10.75" />;
    case "abandoned":
      // A short dash: stopped part way. (Was a 5 px rounded box, which read as nothing.)
      return <path d="M5.25 8H10.75" />;
    case "doneWithFailures": {
      const { done, failed, total } = progress;
      if (done >= total) {
        return <BareGlyph state="done" progress={progress} />;
      }
      const doneEnd = (360 * done) / total;
      const failEnd = (360 * (done + failed)) / total;
      const failStart = failed
        ? Math.min(doneEnd, failEnd - bareMinFail)
        : doneEnd;
      const arcEnd = failed ? failStart - bareGap : doneEnd;
      return (
        <>
          {track}
          {done > 0 && <path d={bareArc(bareCap, arcEnd - bareCap)} />}
          {failed > 0 && (
            <path
              d={bareArc(failStart + bareCap, failEnd - bareCap)}
              style={{ stroke: red }}
            />
          )}
        </>
      );
    }
  }
};

const glyphColor: Record<StepState, string> = {
  notReached: ring,
  running: blue,
  done: green,
  failed: red,
  needsReview: orange,
  skipped: grey,
  abandoned: grey,
  doneWithFailures: green,
};

const spinStyle = css({
  animation: "spin",
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
});

/** Running with items under way draws the progress ring, not the spinner. */
const showsProgress = (state: StepState, progress?: GlyphProgress) =>
  state === "running" &&
  progress !== undefined &&
  progress.done + progress.failed > 0;

/** Partly done with no counts given: 17 of 20 done, 1 failed. */
const sampleProgress: GlyphProgress = { done: 17, failed: 1, total: 20 };

const tooltipTriggerStyle = css({
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
});

/**
 * One state's glyph, 12 px by default, with a hover tooltip naming the state and its detail ("Done · 18 of 18",
 * "Failed · Timed out after 48 h"). `progress` draws partly done and running from real counts and fills the detail;
 * `detail` overrides it. `tooltip={false}` only where the glyph sits inside something that already says its state.
 */
export const RunGlyph = ({
  state,
  size = 12,
  progress,
  detail,
  tooltip = true,
}: {
  state: StepState;
  size?: number;
  progress?: GlyphProgress;
  detail?: string;
  tooltip?: boolean;
}) => {
  const label = glyphTooltip(state, progress, detail);
  const mark =
    glyphSet === "old" ? (
      <OldRunGlyph state={state} size={size} label={label} />
    ) : (
      <svg
        width={glyphSet === "bare" ? Math.max(size, bareMinSize) : size}
        height={glyphSet === "bare" ? Math.max(size, bareMinSize) : size}
        viewBox="0 0 16 16"
        role="img"
        aria-label={label}
        data-run-glyph={state}
        data-glyph-set={glyphSet}
        fill="none"
        stroke="currentColor"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: glyphColor[state] }}
        className={`${css({ flexShrink: 0, overflow: "visible" })}${
          state === "running" && !showsProgress(state, progress)
            ? ` ${spinStyle}`
            : ""
        }`}
      >
        {glyphSet === "bare" ? (
          <BareGlyph state={state} progress={progress ?? sampleProgress} />
        ) : (
          <OutlineGlyph
            state={state}
            progress={progress ?? sampleProgress}
            filled={glyphSet === "filled"}
          />
        )}
      </svg>
    );
  return tooltip ? (
    <Tooltip content={label} openDelay="fast" className={tooltipTriggerStyle}>
      {mark}
    </Tooltip>
  ) : (
    mark
  );
};

/** The filled 12 px set (Figma 1196:88872). */
const OldRunGlyph = ({
  state,
  size = 12,
  label,
}: {
  state: StepState;
  size?: number;
  label: string;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    role="img"
    aria-label={label}
    data-run-glyph={state}
    className={css({ flexShrink: 0, overflow: "visible" })}
  >
    {state === "notReached" ? (
      <circle
        cx="6"
        cy="6"
        r="5.25"
        fill="none"
        stroke={ring}
        strokeWidth="1.2"
      />
    ) : state === "running" ? (
      <>
        <circle
          cx="6"
          cy="6"
          r="5.25"
          fill="none"
          stroke={blue}
          strokeWidth="1.2"
        />
        <path d="M6 0.75a5.25 5.25 0 0 1 0 10.5z" fill={blue} />
      </>
    ) : state === "done" ? (
      <>
        <circle cx="6" cy="6" r="6" fill={green} />
        <Tick />
      </>
    ) : state === "failed" ? (
      <>
        <circle cx="6" cy="6" r="6" fill={red} />
        <path
          d="M4.1 4.1 7.9 7.9M7.9 4.1 4.1 7.9"
          stroke={white}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </>
    ) : state === "needsReview" ? (
      <>
        <circle cx="6" cy="6" r="6" fill={orange} />
        <path
          d="M6 3v3.6"
          stroke={white}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="6" cy="8.7" r="0.85" fill={white} />
      </>
    ) : state === "skipped" ? (
      <>
        <circle
          cx="6"
          cy="6"
          r="5.25"
          fill="none"
          stroke={grey}
          strokeWidth="1.2"
        />
        <path
          d="M3.8 6h4.4"
          stroke={grey}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </>
    ) : state === "abandoned" ? (
      <>
        <circle cx="6" cy="6" r="6" fill={grey} />
        <rect x="4" y="4" width="4" height="4" rx="0.6" fill={white} />
      </>
    ) : (
      <>
        <circle cx="6" cy="6" r="6" fill={green} />
        <Tick />
        <circle
          cx="10.2"
          cy="10.2"
          r="2.6"
          fill={red}
          stroke={white}
          strokeWidth="1.2"
        />
      </>
    )}
  </svg>
);

const pulseStyle = css({ animation: "pulse" });

/**
 * A card's run bar, inside its bottom edge. A clip box the size of the card (radius = the card's less its 1 px border,
 * `overflow: hidden`) holds it, so the bar follows the card's curve at both corners rather than running straight.
 *
 * Items in the same state merge into one segment; a 1.5 px gap appears only where the state changes, so 18 done and
 * 2 failed is two segments (4 Nov: "I don't think we need a gap between each successful state"). A running segment
 * pulses.
 *
 * `finish="reflect"` (?nodeglow=3): each segment fades from its colour at the edge to clear, and casts a faint
 * reflection of itself up the card.
 */
export const RunBar = ({
  segments,
  height = 2,
  gap = 1.5,
  colors = barColor,
  radius = "lg",
  finish = "solid",
}: {
  segments: BarSegment[];
  height?: number;
  gap?: number;
  colors?: Record<BarSegment["state"], string>;
  /** The card's corner token: `lg` for a step card, `xl` for a For each box. */
  radius?: "lg" | "xl";
  finish?: "solid" | "reflect";
}) => {
  const parts: { state: BarSegment["state"]; count: number }[] = [];
  for (const segment of segments) {
    const last = parts.at(-1);
    if (last && last.state === segment.state) {
      last.count += segment.count;
    } else if (segment.count > 0) {
      parts.push({ state: segment.state, count: segment.count });
    }
  }
  const reflect = finish === "reflect";
  const reflection = 10;
  return (
    <span
      aria-hidden
      data-run-clip
      style={{ borderRadius: `calc(var(--radii-${radius}) - 1px)` }}
      className={css({
        position: "absolute",
        inset: "[0]",
        overflow: "hidden",
        pointerEvents: "none",
      })}
    >
      <span
        data-run-bar
        style={{ height: reflect ? height + reflection : height, gap }}
        className={css({
          position: "absolute",
          left: "[0]",
          right: "[0]",
          bottom: "[0]",
          display: "flex",
        })}
      >
        {parts.map((part, index) => {
          const color = colors[part.state];
          return (
            <span
              // eslint-disable-next-line react/no-array-index-key -- runs of one state, in order
              key={`${part.state}-${index}`}
              data-segment={part.state}
              data-count={part.count}
              style={{
                flexGrow: part.count,
                flexBasis: 0,
                minWidth: 2,
                background: reflect
                  ? `linear-gradient(to top, ${color} 0px, color-mix(in srgb, ${color} 45%, transparent) ${height}px, color-mix(in srgb, ${color} 14%, transparent) ${height}px, transparent 100%)`
                  : color,
              }}
              className={part.state === "running" ? pulseStyle : undefined}
            />
          );
        })}
      </span>
    </span>
  );
};
