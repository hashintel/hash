/**
 * The pulse of an arc whose transition fires: a line along the arc that
 * starts wide and narrows to the arc's own width.
 *
 * A firing is a value of a playback frame, and a frame renders no arc. So a
 * pulse is a path this module adds to the page and animates through the Web
 * Animations API, and removes when the animation ends. The transition that
 * fires says so, from the effect that flashes its own box, so a box and its
 * arcs cannot disagree about a firing.
 */

import { createContext } from "react";

import { ARC_HEAD_LENGTH, ARC_STROKE_WIDTH, READ_ARC_DASH } from "./arc-head";
import {
  firingIsVisible,
  type ViewportState,
} from "./firing-animation-visibility";

import type { CanvasArc } from "../../../canvas-scene";

const pulseDuration = 500;
const widestPulse = 65;
const svgNamespace = "http://www.w3.org/2000/svg";

/** What a pulse needs of an arc. Unchanged arcs are the same objects. */
export type PulsingArc = Pick<
  CanvasArc,
  "id" | "kind" | "weight" | "color" | "transitionId"
> & {
  geometry: {
    length: number;
    box: { x: number; y: number; width: number; height: number };
  };
  paths: { curve: string };
};

/** The arcs on the page, and where the pulse of each is drawn. */
export type ArcPulseView = {
  arcs: readonly PulsingArc[];
  /**
   * The element that holds the pulse of the arc at `index` of `arcs`, under
   * the arc's own line.
   */
  holderOf: (index: number) => Element | null;
  viewport: () => ViewportState;
};

export type ArcPulses = {
  /**
   * A transition fired `count` times since the frame before. Each of its
   * arcs that is on screen pulses, as wide as the firings and its weight
   * make it, plus what is left of a pulse still under way.
   */
  fire: (transitionId: string, count: number) => void;
  /**
   * What the page now draws, or `null` when it draws no arc. A pulse under
   * way follows its arc to where the arc is now drawn, and ends with an arc
   * that is gone.
   */
  show: (view: ArcPulseView | null) => void;
};

type Pulse = {
  arc: PulsingArc;
  path: SVGPathElement;
  animation: Animation;
  startTime: number;
  /** The firings this pulse began with, which decide how wide it began. */
  firings: number;
};

/** Writes on a path what the pulse of `arc` draws at rest. */
const drawPulse = (path: SVGPathElement, arc: PulsingArc): void => {
  path.setAttribute("d", arc.paths.curve);
  path.setAttribute("stroke", arc.color);
  if (arc.kind === "standard") {
    // A faded arc stops where its head begins, and so does its pulse. The
    // pane's rule decides when, from this share of the curve.
    const headShare = Math.min(
      1,
      (ARC_HEAD_LENGTH * ARC_STROKE_WIDTH) / arc.geometry.length,
    );
    path.setAttribute("class", "arc-pulse");
    path.setAttribute("pathLength", "1");
    path.style.setProperty("--arc-faded-dash", `${1 - headShare} 1`);
  } else if (arc.kind === "read") {
    path.setAttribute("stroke-dasharray", READ_ARC_DASH);
    path.setAttribute("stroke-linecap", "round");
  }
};

const createPulsePath = (arc: PulsingArc): SVGPathElement => {
  const path = document.createElementNS(svgNamespace, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", String(ARC_STROKE_WIDTH));
  path.setAttribute("pointer-events", "none");
  drawPulse(path, arc);
  return path;
};

export const createArcPulses = (): ArcPulses => {
  let view: ArcPulseView | null = null;
  /** Where the arcs of each transition are in `view.arcs`: built when a firing asks. */
  let indexesByTransition: Map<string, number[]> | null = null;
  const running = new Map<string, Pulse>();

  const end = (pulse: Pulse) => {
    pulse.animation.cancel();
    pulse.path.remove();
    running.delete(pulse.arc.id);
  };

  const start = (arc: PulsingArc, holder: Element, count: number) => {
    const now = performance.now();
    const before = running.get(arc.id);
    // What is left of a pulse under way falls off evenly over its length.
    const left = before
      ? before.firings *
        (1 - Math.min((now - before.startTime) / pulseDuration, 1))
      : 0;
    const firings = count + left;
    const peakWidth = Math.min(
      widestPulse,
      ARC_STROKE_WIDTH + Math.log(1 + firings) * Math.min(6 * arc.weight, 25),
    );

    before?.animation.cancel();
    const path = before?.path ?? createPulsePath(arc);
    if (path.parentNode !== holder) {
      holder.append(path);
    }
    const animation = path.animate(
      [
        { strokeWidth: `${peakWidth}px` },
        { strokeWidth: `${ARC_STROKE_WIDTH}px` },
      ],
      { duration: pulseDuration, easing: "ease-out", fill: "forwards" },
    );
    const pulse: Pulse = { arc, path, animation, startTime: now, firings };
    running.set(arc.id, pulse);
    animation.onfinish = () => {
      if (running.get(arc.id) === pulse) {
        end(pulse);
      }
    };
  };

  return {
    fire: (transitionId, count) => {
      if (!view || count <= 0) {
        return;
      }
      if (!indexesByTransition) {
        indexesByTransition = new Map();
        for (const [index, arc] of view.arcs.entries()) {
          const indexes = indexesByTransition.get(arc.transitionId);
          if (indexes) {
            indexes.push(index);
          } else {
            indexesByTransition.set(arc.transitionId, [index]);
          }
        }
      }
      const viewport = view.viewport();
      for (const index of indexesByTransition.get(transitionId) ?? []) {
        const arc = view.arcs[index];
        // The box the curve fills, in flow units: a curve can sweep well
        // past its ends, so where it is drawn is what decides.
        if (arc && firingIsVisible(viewport, arc.geometry.box)) {
          const holder = view.holderOf(index);
          if (holder) {
            start(arc, holder, count);
          }
        }
      }
    },

    show: (next) => {
      view = next;
      indexesByTransition = null;
      if (running.size === 0) {
        return;
      }
      const indexById = new Map(
        next?.arcs.map((arc, index) => [arc.id, index]),
      );
      for (const pulse of running.values()) {
        const index = indexById.get(pulse.arc.id);
        const arc = index === undefined ? undefined : next?.arcs[index];
        const holder = index === undefined ? null : next?.holderOf(index);
        // An arc of another kind draws another line: its pulse starts afresh.
        if (!arc || !holder || arc.kind !== pulse.arc.kind) {
          end(pulse);
          continue;
        }
        if (arc !== pulse.arc) {
          drawPulse(pulse.path, arc);
          pulse.arc = arc;
        }
        if (pulse.path.parentNode !== holder) {
          holder.append(pulse.path);
        }
      }
    },
  };
};

/** The pulses of the canvas around. Outside a canvas a firing pulses nothing. */
export const ArcPulsesContext = createContext<ArcPulses>({
  fire: () => {},
  show: () => {},
});
