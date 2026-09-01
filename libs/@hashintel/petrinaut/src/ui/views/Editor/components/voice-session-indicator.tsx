import { cva } from "@hashintel/ds-helpers/css";

import {
  useVoiceSessionMicrophoneLevel,
  useVoiceSessionPhase,
} from "../../../../react/voice-session/use-voice-session";

import type { PetrinautAiVoiceSessionPhase } from "../../../types/ai-assistant-composer-control";

type VoiceSessionIndicatorSize = "compact" | "regular";

/**
 * Relative weighting per bar, so a level change reads as a wave across the
 * indicator rather than five bars moving in lockstep.
 */
const bars = [
  { id: "leading", weight: 0.65 },
  { id: "middle-left", weight: 0.9 },
  { id: "center", weight: 1.15 },
  { id: "middle-right", weight: 0.85 },
  { id: "trailing", weight: 0.6 },
] as const;

const barMetrics = {
  compact: { floor: 3, range: 9 },
  regular: { floor: 4, range: 14 },
} as const;

const indicatorStyle = cva({
  base: {
    display: "inline-flex",
    flexShrink: "0",
    alignItems: "center",
    "& > span": {
      display: "block",
      borderRadius: "full",
      backgroundColor: "[currentColor]",
      animationTimingFunction: "ease-in-out",
      animationIterationCount: "[infinite]",
      transition: "[height 90ms linear, opacity 200ms ease]",
    },
    // Colour crossfades on the hand-off between the two voices; height is
    // driven per frame while listening, so it must not be transitioned twice.
    transition: "[color 260ms ease]",
    "& > span:nth-child(2)": { animationDelay: "[110ms]" },
    "& > span:nth-child(3)": { animationDelay: "[220ms]" },
    "& > span:nth-child(4)": { animationDelay: "[330ms]" },
    "& > span:nth-child(5)": { animationDelay: "[440ms]" },
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
      "& > span": {
        animationName: "[none]",
        transition: "[none]",
      },
    },
  },
  variants: {
    size: {
      compact: {
        height: "[14px]",
        gap: "[2px]",
        "& > span": { width: "[2px]" },
      },
      regular: {
        height: "[24px]",
        gap: "[3px]",
        "& > span": { width: "[3px]" },
      },
    },
    phase: {
      connecting: {
        color: "neutral.s80",
        "& > span": {
          animationName: "[petrinautVoiceWait]",
          animationDuration: "[1100ms]",
        },
      },
      error: { color: "neutral.s80" },
      listening: { color: "blue.s90" },
      paused: { color: "neutral.s80" },
      speaking: { color: "neutral.s115" },
      thinking: {
        color: "neutral.s90",
        "& > span": {
          animationName: "[petrinautVoiceWait]",
          animationDuration: "[1200ms]",
        },
      },
    },
    speaking: {
      compact: {
        "& > span": {
          animationName: "[petrinautVoiceSpeakCompact]",
          animationDuration: "[900ms]",
        },
      },
      regular: {
        "& > span": {
          animationName: "[petrinautVoiceSpeak]",
          animationDuration: "[900ms]",
        },
      },
    },
    handoff: {
      true: {
        animationName: "[petrinautVoiceHandoff]",
        animationDuration: "[300ms]",
        animationTimingFunction: "[cubic-bezier(0.3, 1.4, 0.4, 1)]",
      },
    },
  },
});

const isTurnPhase = (phase: PetrinautAiVoiceSessionPhase): boolean =>
  phase === "listening" || phase === "speaking" || phase === "thinking";

export type VoiceSessionIndicatorProps = {
  /** Normalized 0–1 input level; only read while listening. */
  microphoneLevel: number;
  phase: PetrinautAiVoiceSessionPhase;
  size?: VoiceSessionIndicatorSize;
};

/**
 * One indicator for both voices: blue bars tracking the microphone while the
 * user speaks, graphite bars in a travelling wave while the assistant answers.
 */
export const VoiceSessionIndicator = ({
  microphoneLevel,
  phase,
  size = "regular",
}: VoiceSessionIndicatorProps) => {
  const { floor, range } = barMetrics[size];

  return (
    <span
      aria-hidden="true"
      // Keying on the phase remounts the indicator when the turn changes hands,
      // which is the only way a CSS animation can replay without imperatively
      // touching the DOM.
      key={phase}
      className={indicatorStyle({
        handoff: isTurnPhase(phase),
        phase,
        size,
        speaking: phase === "speaking" ? size : undefined,
      })}
      data-phase={phase}
      data-testid="voice-session-indicator"
    >
      {bars.map(({ id, weight }) => (
        <span
          key={id}
          style={
            phase === "listening"
              ? {
                  height: `${floor + Math.round(microphoneLevel * weight * range)}px`,
                }
              : { height: `${floor}px` }
          }
        />
      ))}
    </span>
  );
};

/**
 * Subscribes to the session store directly so per-frame level updates
 * re-render the bars alone, not the surfaces hosting them.
 */
export const LiveVoiceSessionIndicator = ({
  size,
}: {
  size?: VoiceSessionIndicatorSize;
}) => {
  const phase = useVoiceSessionPhase();
  const microphoneLevel = useVoiceSessionMicrophoneLevel();

  if (phase === null) {
    return null;
  }

  return (
    <VoiceSessionIndicator
      microphoneLevel={microphoneLevel}
      phase={phase}
      size={size}
    />
  );
};
