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
const maxAmplitude = ribbonHeight / 2 - 2;

/** Three strokes: one solid ribbon and two faint echoes trailing it. */
const layers = [
  { alpha: 1, damping: 1, lineWidth: 3, phaseOffset: 0, speedScale: 1 },
  { alpha: 0.32, damping: 0.78, lineWidth: 2, phaseOffset: 1, speedScale: 1.3 },
  {
    alpha: 0.18,
    damping: 0.56,
    lineWidth: 2,
    phaseOffset: 2,
    speedScale: 1.6,
  },
] as const;

type RibbonMotion = {
  /** Fraction of {@link maxAmplitude}, given the current level and angle. */
  amplitude: (level: number, angle: number) => number;
  /** Radians advanced per frame. */
  speed: number;
};

/**
 * The user's turn is the only one driven by real input; every other phase gets
 * a deterministic motion so the ribbon can't imply sound that isn't there.
 */
const ribbonMotion: Record<PetrinautAiVoiceSessionPhase, RibbonMotion> = {
  connecting: { amplitude: () => 0.16, speed: 0.05 },
  error: { amplitude: () => 0.05, speed: 0 },
  listening: { amplitude: (level) => 0.18 + level * 0.82, speed: 0.09 },
  muted: { amplitude: () => 0.05, speed: 0 },
  paused: { amplitude: () => 0.05, speed: 0 },
  speaking: {
    amplitude: (_level, angle) => 0.52 + Math.sin(angle * 0.9) * 0.3,
    speed: 0.13,
  },
  thinking: {
    amplitude: (_level, angle) => 0.14 + Math.sin(angle * 0.8) * 0.05,
    speed: 0.05,
  },
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

const approach = (current: number, target: number, rate: number): number =>
  current + (target - current) * rate;

/* eslint-disable no-param-reassign -- a 2D context is configured by assigning
   to it; that is the canvas API, not an unintended side effect. */
const drawRibbon = ({
  amplitude,
  angle,
  color,
  context,
}: {
  amplitude: number;
  angle: number;
  color: Rgb;
  context: CanvasRenderingContext2D;
}) => {
  const midline = ribbonHeight / 2;
  const peak = amplitude * maxAmplitude;
  const [red, green, blue] = color;

  context.clearRect(0, 0, ribbonWidth, ribbonHeight);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;

  for (const layer of layers) {
    context.beginPath();
    context.globalAlpha = layer.alpha;
    context.lineWidth = layer.lineWidth;

    for (let x = 0; x <= ribbonWidth; x += 3) {
      // Tapering to nothing at both ends turns a plain sine into a ribbon.
      const taper = Math.sin((x / ribbonWidth) * Math.PI) ** 1.5;
      // Two waves at different wavelengths beat against each other, which
      // reads as speech rather than as a test tone.
      const wobble =
        Math.sin(x / 13 + angle * layer.speedScale + layer.phaseOffset) *
        Math.sin(x / 6 - angle * 0.7);
      const y = midline + wobble * peak * taper * layer.damping;

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
  // Kept across phase changes so the ribbon eases between turns instead of
  // snapping when the effect below re-runs.
  const angleRef = useRef(0);
  const levelRef = useRef(0);
  const amplitudeRef = useRef(0);
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

    const motion = ribbonMotion[phase];
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      colorRef.current = targetColor;
      drawRibbon({
        amplitude: motion.amplitude(0, 0),
        angle: 0,
        color: targetColor,
        context,
      });
      return;
    }

    let frame = 0;

    const render = () => {
      levelRef.current = approach(levelRef.current, getMicrophoneLevel(), 0.25);
      amplitudeRef.current = approach(
        amplitudeRef.current,
        motion.amplitude(levelRef.current, angleRef.current),
        0.16,
      );
      angleRef.current += motion.speed;

      const current = colorRef.current ?? targetColor;
      colorRef.current = [
        approach(current[0], targetColor[0], 0.08),
        approach(current[1], targetColor[1], 0.08),
        approach(current[2], targetColor[2], 0.08),
      ];

      drawRibbon({
        amplitude: amplitudeRef.current,
        angle: angleRef.current,
        color: colorRef.current,
        context,
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
