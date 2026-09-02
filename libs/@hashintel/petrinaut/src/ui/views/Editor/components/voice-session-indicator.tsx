import { useEffect, useRef } from "react";

import { cva } from "@hashintel/ds-helpers/css";

import {
  useVoiceSessionMicrophoneLevelReader,
  useVoiceSessionPhase,
} from "../../../../react/voice-session/use-voice-session";

import type { PetrinautAiVoiceSessionPhase } from "../../../types/ai-assistant-composer-control";

const ribbonWidth = 104;
const ribbonHeight = 32;

const restAmplitude = 1.6;

const levelAmplitude = 11.2;

const microphoneCurve = 0.6;
const microphoneGain = 1.45;

/** Rise with the voice, fall back slowly, the way a level meter does. */
const attackTime = 0.05;
const releaseTime = 0.24;

/** Seconds for the hand-off between the two voices to finish. */
const colorFadeTime = 0.35;

const slowWaveSpan = 8.4;
const fastWaveSpan = 20.4;

const listeningTravelSpeed = 4.2;
const speakingTravelSpeed = 8.4;

const strokes = [
  { alpha: 1, lineWidth: 2, phaseOffset: 0, phaseScale: 1, scale: 1 },
  {
    alpha: 0.3,
    lineWidth: 1.25,
    phaseOffset: 1,
    phaseScale: 1.35,
    scale: 0.78,
  },
  { alpha: 0.2, lineWidth: 1.25, phaseOffset: 2, phaseScale: 1.7, scale: 0.56 },
] as const;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

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
 * They all feed the same waves, which keeps the two voices one component.
 */
const phaseLevel: Record<
  PetrinautAiVoiceSessionPhase,
  (seconds: number, microphoneLevel: number) => number
> = {
  connecting: (seconds) => 0.1 + Math.sin(seconds * 2.2) * 0.04,
  error: () => 0,
  listening: (_seconds, microphoneLevel) =>
    clamp01(microphoneLevel) ** microphoneCurve * microphoneGain,
  muted: () => 0,
  paused: () => 0,
  // Syllables riding a slower phrase, so the assistant sounds like it is
  // talking rather than humming.
  speaking: (seconds) =>
    0.42 +
    Math.sin(seconds * 3.3) * Math.sin(seconds * 1.1) * 0.28 +
    Math.sin(seconds * 7.1) * 0.08,
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

/* eslint-disable no-param-reassign -- a 2D context is configured by assigning
   to it; that is the canvas API, not an unintended side effect. */
const drawRibbon = ({
  amplitude,
  color,
  context,
  travel,
}: {
  amplitude: number;
  color: Rgb;
  context: CanvasRenderingContext2D;
  travel: number;
}) => {
  const midline = ribbonHeight / 2;
  const [red, green, blue] = color;
  const channels = `${Math.round(red)}, ${Math.round(green)}, ${Math.round(
    blue,
  )}`;

  context.clearRect(0, 0, ribbonWidth, ribbonHeight);
  context.lineCap = "round";
  context.lineJoin = "round";

  const gradient = context.createLinearGradient(0, 0, ribbonWidth, 0);
  gradient.addColorStop(0, `rgba(${channels}, 0.15)`);
  gradient.addColorStop(0.5, `rgba(${channels}, 0.95)`);
  gradient.addColorStop(1, `rgba(${channels}, 0.15)`);
  context.strokeStyle = gradient;

  for (const stroke of strokes) {
    context.beginPath();
    context.globalAlpha = stroke.alpha;
    context.lineWidth = stroke.lineWidth;

    for (let x = 0; x <= ribbonWidth; x += 2) {
      const progress = x / ribbonWidth;
      const taper = Math.sin(progress * Math.PI) ** 1.5;
      const wobble =
        Math.sin(
          progress * slowWaveSpan +
            travel * stroke.phaseScale +
            stroke.phaseOffset,
        ) * Math.sin(progress * fastWaveSpan - travel * 0.7);
      const y = midline + wobble * amplitude * taper * stroke.scale;

      if (x === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

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
 * One ribbon for both voices: blue and tracking the microphone while the user
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
  const clockRef = useRef(0);
  const travelRef = useRef(0);
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

    const targetColor = parseColor(window.getComputedStyle(canvas).color);
    colorRef.current ??= targetColor;

    const levelOf = phaseLevel[phase];
    const travelSpeed =
      phase === "speaking" ? speakingTravelSpeed : listeningTravelSpeed;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      colorRef.current = targetColor;
      levelRef.current = clamp01(levelOf(0, getMicrophoneLevel()));
      drawRibbon({
        amplitude: restAmplitude + levelRef.current * levelAmplitude,
        color: targetColor,
        context,
        travel: travelRef.current,
      });

      return;
    }

    let frame = 0;
    let lastTimestamp: number | null = null;

    const render = (timestamp: number) => {
      // Clamped so a backgrounded tab resumes rather than fast-forwards.
      const delta =
        lastTimestamp === null
          ? 0
          : Math.min(0.1, (timestamp - lastTimestamp) / 1000);
      lastTimestamp = timestamp;
      clockRef.current += delta;
      travelRef.current += delta * travelSpeed;

      const target = clamp01(levelOf(clockRef.current, getMicrophoneLevel()));
      levelRef.current = easeTowards(
        levelRef.current,
        target,
        delta,
        target > levelRef.current ? attackTime : releaseTime,
      );

      const current = colorRef.current ?? targetColor;
      colorRef.current = [
        easeTowards(current[0], targetColor[0], delta, colorFadeTime),
        easeTowards(current[1], targetColor[1], delta, colorFadeTime),
        easeTowards(current[2], targetColor[2], delta, colorFadeTime),
      ];

      drawRibbon({
        amplitude: restAmplitude + levelRef.current * levelAmplitude,
        color: colorRef.current,
        context,
        travel: travelRef.current,
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
