/**
 * The pure part of the event timeline's gestures: how a wheel event reads,
 * where a point lands, and how the view range moves. The chart feeds these
 * from DOM events and draws the result.
 */

import type { TimeRange } from "./use-event-timeline-data";

/** The narrowest span the view zooms to, in seconds. */
export const MIN_VIEW_SPAN = 0.01;

const WHEEL_ZOOM_GAIN = 0.002;
/** Pinch and cmd/ctrl+wheel deliver small deltas, so they get more gain. */
const PINCH_ZOOM_GAIN = 0.01;

/** A view range of `span` seconds from `min`, kept inside the run. */
export const clampRange = (
  min: number,
  span: number,
  domain: number,
): TimeRange => {
  const boundedSpan = Math.min(
    Math.max(span, MIN_VIEW_SPAN),
    Math.max(domain, MIN_VIEW_SPAN),
  );
  const boundedMin = Math.min(
    Math.max(min, 0),
    Math.max(0, domain - boundedSpan),
  );
  return { min: boundedMin, max: boundedMin + boundedSpan };
};

/**
 * The range scaled by `factor` about `pivot`, a time that stays put. A zoom
 * the span's limits stop part of the way moves the range only as far as the
 * span changed, so zooming in at the narrowest span holds still.
 */
export const zoomRange = (
  range: TimeRange,
  factor: number,
  pivot: number,
  domain: number,
): TimeRange => {
  const span = range.max - range.min;
  const { min, max } = clampRange(0, span * factor, domain);
  const applied = span > 0 ? (max - min) / span : 1;
  return clampRange(pivot - (pivot - range.min) * applied, max - min, domain);
};

/** The range moved by `shift` seconds. */
export const panRange = (
  range: TimeRange,
  shift: number,
  domain: number,
): TimeRange => clampRange(range.min + shift, range.max - range.min, domain);

export type WheelGesture =
  | { kind: "zoom"; factor: number }
  | { kind: "pan"; pixels: number };

/**
 * What a wheel event asks of the view. Pinch and cmd/ctrl+wheel zoom, shift
 * pans, and otherwise the dominant axis decides between a horizontal pan and
 * a vertical zoom, so a trackpad swipe does one thing at a time.
 */
export const classifyWheel = (
  event: Pick<
    WheelEvent,
    "deltaX" | "deltaY" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
): WheelGesture => {
  if (event.ctrlKey || event.metaKey) {
    return { kind: "zoom", factor: Math.exp(event.deltaY * PINCH_ZOOM_GAIN) };
  }
  if (event.shiftKey) {
    // Browsers turn shift+wheel on a mouse into a horizontal delta; a
    // trackpad keeps it vertical.
    return {
      kind: "pan",
      pixels: event.deltaX === 0 ? event.deltaY : event.deltaX,
    };
  }
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
    return { kind: "pan", pixels: event.deltaX };
  }
  return { kind: "zoom", factor: Math.exp(event.deltaY * WHEEL_ZOOM_GAIN) };
};

/** The plot area in CSS pixels, relative to the chart's root. */
export type PlotBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type HitZone = "playhead" | "ruler" | "plot" | "outside";

/**
 * Where a point lands: on the playhead line, within `grab` pixels of it in
 * the ruler or the plot; on the ruler, the `rulerHeight` pixels above the
 * plot; in the plot; or outside all of them.
 */
export const hitTest = ({
  x,
  y,
  plot,
  rulerHeight,
  playheadX,
  grab,
}: {
  x: number;
  y: number;
  plot: PlotBox;
  rulerHeight: number;
  playheadX: number;
  grab: number;
}): HitZone => {
  const inside =
    x >= plot.left &&
    x <= plot.left + plot.width &&
    y >= plot.top - rulerHeight &&
    y <= plot.top + plot.height;
  if (!inside) {
    return "outside";
  }
  if (Math.abs(x - playheadX) <= grab) {
    return "playhead";
  }
  return y < plot.top ? "ruler" : "plot";
};

/**
 * Whether playback a scrub paused starts again when the scrub is released.
 * It does, except at the end of a run that is over: Play there starts the
 * run again from the beginning, which a release should not.
 */
export const resumesAfterScrub = ({
  time,
  coveredTime,
  runIsOver,
}: {
  time: number;
  coveredTime: number;
  runIsOver: boolean;
}): boolean => !runIsOver || time < coveredTime;
