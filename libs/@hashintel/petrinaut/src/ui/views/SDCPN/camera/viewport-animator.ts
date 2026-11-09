/**
 * Eases the canvas viewport toward a target with a critically damped spring.
 *
 * A spring, rather than a fixed-duration tween, because the target moves
 * while the camera is on its way: a panel slides open, a splitter is dragged,
 * the selection changes again. Each new target keeps the camera's velocity,
 * so the path bends towards it instead of stopping and starting over.
 */

import type { CanvasViewport } from "../canvas-renderer";

type Channel = { readonly value: number; readonly velocity: number };

/**
 * Advances a critically damped spring by `dt` seconds. Exact rather than
 * integrated, so a long frame cannot overshoot or blow up.
 */
export const stepCriticalSpring = (
  channel: Channel,
  target: number,
  omega: number,
  dt: number,
): Channel => {
  const offset = channel.value - target;
  const momentum = channel.velocity + omega * offset;
  const decay = Math.exp(-omega * dt);
  return {
    value: target + (offset + momentum * dt) * decay,
    velocity: (channel.velocity - omega * momentum * dt) * decay,
  };
};

/** Zoom moves in log space, so zooming in and out by a factor feel alike. */
type CameraState = {
  readonly x: Channel;
  readonly y: Channel;
  readonly logZoom: Channel;
};

const at = (value: number): Channel => ({ value, velocity: 0 });

const isSettled = (state: CameraState, target: CanvasViewport) =>
  Math.abs(state.x.value - target.x) < 0.25 &&
  Math.abs(state.y.value - target.y) < 0.25 &&
  Math.abs(state.logZoom.value - Math.log(target.zoom)) < 1e-4 &&
  Math.abs(state.x.velocity) < 2 &&
  Math.abs(state.y.velocity) < 2 &&
  Math.abs(state.logZoom.velocity) < 1e-3;

export type AnimationResult = "settled" | "cancelled";

export type ViewportAnimator = {
  /** Eases toward `target`, or retargets the move under way. */
  animateTo: (target: CanvasViewport) => Promise<AnimationResult>;
  /** Stops where the camera is, as when the user grabs the canvas. */
  cancel: () => void;
  isAnimating: () => boolean;
};

/**
 * Natural frequency of the spring, in radians per second. At 14 the camera
 * covers most of a move in about a fifth of a second and settles within a
 * third, close to the panels' own slide.
 */
const defaultOmega = 14;

/** A frame longer than this is treated as this long, as after a hidden tab. */
const maxFrameSeconds = 0.064;

export const createViewportAnimator = ({
  read,
  write,
  animated = () => true,
  omega = defaultOmega,
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (handle) => cancelAnimationFrame(handle),
}: {
  read: () => CanvasViewport;
  write: (viewport: CanvasViewport) => void;
  /** Whether to ease at all; when not, every move jumps. */
  animated?: () => boolean;
  omega?: number;
  requestFrame?: (callback: (time: number) => void) => number;
  cancelFrame?: (handle: number) => void;
}): ViewportAnimator => {
  let target: CanvasViewport | null = null;
  let state: CameraState | null = null;
  let frame: number | null = null;
  let lastTime: number | null = null;
  let pending: ((result: AnimationResult) => void)[] = [];

  const finish = (result: AnimationResult) => {
    if (frame !== null) {
      cancelFrame(frame);
    }
    frame = null;
    lastTime = null;
    state = null;
    target = null;
    const resolvers = pending;
    pending = [];
    for (const resolve of resolvers) {
      resolve(result);
    }
  };

  const tick = (time: number) => {
    frame = null;
    if (!state || !target) {
      return;
    }
    const dt =
      lastTime === null
        ? 1 / 60
        : Math.min(maxFrameSeconds, (time - lastTime) / 1_000);
    lastTime = time;
    const next: CameraState = {
      x: stepCriticalSpring(state.x, target.x, omega, dt),
      y: stepCriticalSpring(state.y, target.y, omega, dt),
      logZoom: stepCriticalSpring(
        state.logZoom,
        Math.log(target.zoom),
        omega,
        dt,
      ),
    };
    if (isSettled(next, target)) {
      const final = target;
      // Marked idle before the last write, so whatever the write notifies
      // sees a camera at rest.
      finish("settled");
      write(final);
      return;
    }
    state = next;
    write({
      x: next.x.value,
      y: next.y.value,
      zoom: Math.exp(next.logZoom.value),
    });
    frame = requestFrame(tick);
  };

  return {
    animateTo: (nextTarget) =>
      new Promise<AnimationResult>((resolve) => {
        if (!animated()) {
          finish("cancelled");
          write(nextTarget);
          resolve("settled");
          return;
        }
        pending.push(resolve);
        if (!state) {
          const current = read();
          state = {
            x: at(current.x),
            y: at(current.y),
            logZoom: at(Math.log(current.zoom)),
          };
        }
        target = nextTarget;
        if (frame === null) {
          frame = requestFrame(tick);
        }
      }),
    cancel: () => {
      if (state) {
        finish("cancelled");
      }
    },
    isAnimating: () => state !== null,
  };
};
