import { useEffect, useRef } from "react";

import { cva } from "@hashintel/ds-helpers/css";

import {
  useVoiceSessionMicrophoneLevelReader,
  useVoiceSessionPhase,
} from "../../../../react/voice-session/use-voice-session";

import type { PetrinautAiVoiceSessionPhase } from "../../../types/ai-assistant-composer-control";

const ribbonWidth = 104;
const ribbonHeight = 32;

/** Peak deflection from the midline, in CSS pixels. */
const maxAmplitude = 10;

/** Seconds between contour samples, and how many the ribbon holds. */
const sampleInterval = 0.045;
const contourLength = 40;

/** Kept open by this much so a silent turn still reads as a ribbon. */
const envelopeFloor = 0.05;

/** How much of the level reaches the contour above the floor. */
const envelopeGain = 0.78;

/** Rise with the voice, fall back slowly, the way a level meter does. */
const attackTime = 0.06;
const releaseTime = 0.28;

/** Seconds for the hand-off between the two voices to finish. */
const colorFadeTime = 0.35;

/** One stroke carries the contour; the other trails it as a faint echo. */
const strokes = [
  { alpha: 0.92, delay: 0, lineWidth: 1.5, scale: 1 },
  { alpha: 0.16, delay: 5, lineWidth: 1, scale: 0.6 },
] as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const progress = clamp01((value - edge0) / (edge1 - edge0));

  return progress * progress * (3 - 2 * progress);
};

/** Frame-rate independent easing; `timeConstant` is the 63% settling time. */
const easeTowards = (
  current: number,
  target: number,
  deltaSeconds: number,
  timeConstant: number,
): number =>
  current + (target - current) * (1 - Math.exp(-deltaSeconds / timeConstant));

/**
 * Only the user's turn is heard, so every other phase supplies its own level.
 * They all feed the same contour, which keeps the two voices one component.
 */
const phaseLevel: Record<
  PetrinautAiVoiceSessionPhase,
  (seconds: number, microphoneLevel: number) => number
> = {
  connecting: (seconds) => 0.1 + Math.sin(seconds * 2.2) * 0.04,
  error: () => 0,
  listening: (_seconds, microphoneLevel) => microphoneLevel,
  muted: () => 0,
  paused: () => 0,
  // Syllables riding a slower phrase, so the assistant sounds like it is
  // talking rather than humming.
  speaking: (seconds) =>
    0.34 +
    Math.sin(seconds * 3.3) * Math.sin(seconds * 1.1) * 0.24 +
    Math.sin(seconds * 7.1) * 0.07,
  thinking: (seconds) => 0.11 + Math.sin(seconds * 1.7) * 0.04,
};

// Canvas can't inherit `currentColor`, so the phase colour is read back off the
// element and crossfaded here — the hand-off between the two voices is the one
// moment the colour carries meaning.
const ribbonStyle = cva({
  base: {
    display: "block",
    flexShrink: "0",
    width: `[${ribbonWidth}px]`,
    height: `[${ribbonHeight}px]`,
  },
  variants: {
    phase: {
      connecting: { color: "neutral.s80" },
      error: { color: "neutral.s80" },
      listening: { color: "blue.s90" },
      muted: { color: "neutral.s80" },
      paused: { color: "neutral.s80" },
      speaking: { color: "neutral.s115" },
      thinking: { color: "neutral.s90" },
    },
  },
});

type Rgb = readonly [number, number, number];

const fallbackColor: Rgb = [110, 118, 128];

const parseColor = (value: string): Rgb => {
  const channels = value.match(/\d+(?:\.\d+)?/g);
  if (channels === null || channels.length < 3) {
    return fallbackColor;
  }
  const [red, green, blue] = channels;

  return [Number(red), Number(green), Number(blue)];
};

/** Reads 0 at the oldest sample and `contourLength - 1` at the newest. */
type ContourReader = (position: number) => number;

/**
 * A couple of seconds of levels, oldest first. Holding the recent contour is
 * what lets the ribbon show the shape of what was said instead of a squiggle
 * that merely gets taller.
 */
const createContour = () => {
  const samples = new Array<number>(contourLength).fill(0);
  let cursor = 0;

  const read: ContourReader = (position) => {
    const clamped = Math.min(contourLength - 1, Math.max(0, position));
    const index = Math.floor(clamped);
    const next = Math.min(index + 1, contourLength - 1);
    const blend = smoothstep(0, 1, clamped - index);

    const from = samples[(cursor + index) % contourLength] ?? 0;
    const to = samples[(cursor + next) % contourLength] ?? 0;

    return from + (to - from) * blend;
  };

  return {
    fill: (value: number) => samples.fill(value),
    push: (value: number) => {
      samples[cursor] = value;
      cursor = (cursor + 1) % contourLength;
    },
    read,
  };
};

const deflectionAt = ({
  offset,
  read,
  stroke,
  x,
}: {
  offset: number;
  read: ContourReader;
  stroke: (typeof strokes)[number];
  x: number;
}): number => {
  const progress = x / ribbonWidth;
  const position = progress * (contourLength - 1) - offset - stroke.delay;
  // Fades in over the oldest samples and closes at the newest, so the shape
  // reads as a ribbon rather than as a cropped graph. The square root keeps
  // the ends rounded instead of drawing them out into points.
  const taper = Math.sqrt(
    smoothstep(0, 0.3, progress) * smoothstep(1, 0.9, progress),
  );

  return (
    (envelopeFloor + read(position) * envelopeGain) *
    maxAmplitude *
    taper *
    stroke.scale
  );
};

/* eslint-disable no-param-reassign -- a 2D context is configured by assigning
   to it; that is the canvas API, not an unintended side effect. */
const drawRibbon = ({
  color,
  context,
  offset,
  read,
}: {
  color: Rgb;
  context: CanvasRenderingContext2D;
  /** Sub-sample scroll, so the contour drifts rather than stepping. */
  offset: number;
  read: ContourReader;
}) => {
  const midline = ribbonHeight / 2;
  const [red, green, blue] = color;

  context.clearRect(0, 0, ribbonWidth, ribbonHeight);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;

  for (const stroke of strokes) {
    context.beginPath();
    context.globalAlpha = stroke.alpha;
    context.lineWidth = stroke.lineWidth;

    for (let x = 0; x <= ribbonWidth; x += 2) {
      const y = midline - deflectionAt({ offset, read, stroke, x });

      if (x === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    // The contour is mirrored on the way back, closing the ribbon.
    for (let x = ribbonWidth; x >= 0; x -= 2) {
      context.lineTo(x, midline + deflectionAt({ offset, read, stroke, x }));
    }

    context.closePath();
    context.stroke();
  }

  context.globalAlpha = 1;
};
/* eslint-enable no-param-reassign */

export type VoiceSessionIndicatorProps = {
  /** Sampled per frame; pass a reader rather than a value to avoid re-renders. */
  getMicrophoneLevel: () => number;
  phase: PetrinautAiVoiceSessionPhase;
};

/**
 * One ribbon for both voices: blue and tracing the microphone while the user
 * speaks, graphite and self-driven while the assistant answers, flat while
 * nobody holds the turn.
 */
export const VoiceSessionIndicator = ({
  getMicrophoneLevel,
  phase,
}: VoiceSessionIndicatorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Kept across phase changes so the ribbon carries on from where the last
  // turn left it instead of snapping when the effect below re-runs.
  const contourRef = useRef<ReturnType<typeof createContour> | null>(null);
  const clockRef = useRef(0);
  const levelRef = useRef(0);
  const colorRef = useRef<Rgb | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d") ?? null;
    if (canvas === null || context === null) {
      return;
    }

    const scale = window.devicePixelRatio || 1;
    canvas.width = ribbonWidth * scale;
    canvas.height = ribbonHeight * scale;
    context.setTransform(scale, 0, 0, scale, 0, 0);

    const contour = (contourRef.current ??= createContour());
    const targetColor = parseColor(window.getComputedStyle(canvas).color);
    colorRef.current ??= targetColor;

    const levelOf = phaseLevel[phase];
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      colorRef.current = targetColor;
      contour.fill(clamp01(levelOf(0, getMicrophoneLevel())));
      drawRibbon({
        color: targetColor,
        context,
        offset: 0,
        read: contour.read,
      });

      return;
    }

    let frame = 0;
    let lastTimestamp: number | null = null;
    let sinceSample = 0;

    const render = (timestamp: number) => {
      // Clamped so a backgrounded tab resumes rather than fast-forwards.
      const delta =
        lastTimestamp === null
          ? 0
          : Math.min(0.1, (timestamp - lastTimestamp) / 1000);
      lastTimestamp = timestamp;
      clockRef.current += delta;

      const target = clamp01(levelOf(clockRef.current, getMicrophoneLevel()));
      levelRef.current = easeTowards(
        levelRef.current,
        target,
        delta,
        target > levelRef.current ? attackTime : releaseTime,
      );

      sinceSample += delta;
      while (sinceSample >= sampleInterval) {
        contour.push(levelRef.current);
        sinceSample -= sampleInterval;
      }

      const current = colorRef.current ?? targetColor;
      colorRef.current = [
        easeTowards(current[0], targetColor[0], delta, colorFadeTime),
        easeTowards(current[1], targetColor[1], delta, colorFadeTime),
        easeTowards(current[2], targetColor[2], delta, colorFadeTime),
      ];

      drawRibbon({
        color: colorRef.current,
        context,
        offset: sinceSample / sampleInterval,
        read: contour.read,
      });

      frame = requestAnimationFrame(render);
    };

    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [getMicrophoneLevel, phase]);

  return (
    <canvas
      aria-hidden="true"
      className={ribbonStyle({ phase })}
      data-phase={phase}
      data-testid="voice-session-indicator"
      ref={canvasRef}
    />
  );
};

/** Pulls the level straight from the store, so drawing costs no re-renders. */
export const LiveVoiceSessionIndicator = () => {
  const phase = useVoiceSessionPhase();
  const getMicrophoneLevel = useVoiceSessionMicrophoneLevelReader();

  if (phase === null) {
    return null;
  }

  return (
    <VoiceSessionIndicator
      getMicrophoneLevel={getMicrophoneLevel}
      phase={phase}
    />
  );
};
