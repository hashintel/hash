import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import {
  useVoiceSessionActions,
  useVoiceSessionCanReadFullResponse,
  useVoiceSessionCanRepeatQuestion,
  useVoiceSessionCanRetryPlayback,
  useVoiceSessionCanTakeTurn,
  useVoiceSessionInterruptionBySpeaking,
  useVoiceSessionMicrophoneMuted,
  useVoiceSessionNotice,
  useVoiceSessionPhase,
} from "../../../../../../react/voice-session/use-voice-session";
import { LiveVoiceSessionIndicator } from "../../../components/voice-session-indicator";
import {
  voiceSessionActionLabels,
  voiceSessionStatusLabel,
  voiceSetupLabels,
} from "../../../components/voice-session-labels";
import { aiFooterMinHeight } from "./footer-height";
import { MicrophoneIcon } from "./voice-dock/microphone-icon";
import { VoicePlaybackMenu } from "./voice-dock/playback-menu";

import type { VoiceSessionActions } from "../../../../../../react/voice-session/store";
import type { PetrinautAiVoiceSessionPhase } from "../../../../../types/ai-assistant-composer-control";
import type { ReactNode } from "react";

const dockStyle = css({
  display: "flex",
  flexShrink: 0,
  boxSizing: "border-box",
  minHeight: `[${aiFooterMinHeight}px]`,
  alignItems: "center",
  gap: "2",
  padding: "[10px 12px]",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  backgroundColor: "neutral.s00",
  animationName: "[petrinautVoiceSwap]",
  animationDuration: "[200ms]",
  animationTimingFunction: "[ease-out]",
  "@media (prefers-reduced-motion: reduce)": {
    animationName: "[none]",
  },
});

// Equal flexible sides keep the ribbon on the panel's centre line however wide
// the phase label or the action cluster turn out to be. With an error control,
// reserve the controls' width and let the status shrink instead of overlapping.
const sideStyle = cva({
  base: {
    display: "flex",
    flex: "1",
    minWidth: "[0]",
    alignItems: "center",
  },
  variants: {
    withError: { true: { flex: "[0 0 auto]" } },
  },
});

const centerStyle = cva({
  base: {
    display: "flex",
    minWidth: "[0]",
    alignItems: "center",
    gap: "2",
  },
  variants: {
    withError: { true: { flex: "1", justifyContent: "center" } },
  },
});

const statusStyle = cva({
  base: {
    fontSize: "xs",
    fontWeight: "medium",
    overflow: "hidden",
    letterSpacing: "[0.04em]",
    textOverflow: "ellipsis",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    transition: "[color 260ms ease]",
  },
  variants: {
    phase: {
      connected: { color: "blue.s90" },
      connecting: { color: "neutral.s90" },
      error: { color: "neutral.s100" },
      listening: { color: "blue.s90" },
      muted: { color: "neutral.s100" },
      paused: { color: "neutral.s90" },
      speaking: { color: "neutral.s115" },
      thinking: { color: "neutral.s90" },
    },
  },
});

const actionsStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "1",
});

const visuallyHiddenStyle = css({
  position: "absolute",
  width: "[1px]",
  height: "[1px]",
  padding: "[0]",
  margin: "[-1px]",
  overflow: "hidden",
  clip: "[rect(0, 0, 0, 0)]",
  whiteSpace: "nowrap",
  borderWidth: "[0]",
});

export type VoiceDockProps = {
  actions: VoiceSessionActions | null;
  canReadFullResponse: boolean;
  canRepeatQuestion: boolean;
  canRetryPlayback?: boolean;
  canTakeTurn: boolean;
  collapsed: boolean;
  errorIndicator?: ReactNode;
  /** Rendered instead of the live indicator when the caller supplies one. */
  indicator?: ReactNode;
  interruptionBySpeaking?: boolean;
  microphoneMuted: boolean;
  notice?: string | null;
  onCollapsedEnd?: () => void;
  onCollapsedToggle: () => void;
  phase: PetrinautAiVoiceSessionPhase;
  purpose?: "session" | "setup";
};

/**
 * The compact Voice surface inside the assistant panel: one ribbon for setup
 * or live-session status and controls.
 */
export const VoiceDock = ({
  actions,
  canReadFullResponse,
  canRepeatQuestion,
  canRetryPlayback = false,
  canTakeTurn,
  collapsed,
  errorIndicator,
  indicator,
  interruptionBySpeaking = false,
  microphoneMuted,
  notice,
  onCollapsedEnd,
  onCollapsedToggle,
  phase,
  purpose = "session",
}: VoiceDockProps) => {
  const collapseLabel =
    purpose === "setup"
      ? collapsed
        ? voiceSetupLabels.expand
        : voiceSetupLabels.collapse
      : collapsed
        ? voiceSessionActionLabels.expand
        : voiceSessionActionLabels.collapse;
  const microphoneLabel = microphoneMuted
    ? voiceSessionActionLabels.unmute
    : voiceSessionActionLabels.mute;
  const statusLabel =
    purpose === "setup"
      ? voiceSetupLabels.status
      : (notice ?? voiceSessionStatusLabel(phase));

  return (
    <section
      aria-label={
        purpose === "setup" ? voiceSetupLabels.region : "Voice session"
      }
      className={dockStyle}
      data-phase={phase}
      data-testid="ai-voice-dock"
    >
      <span className={sideStyle({ withError: !!errorIndicator })}>
        <Button
          aria-label={collapseLabel}
          iconName={collapsed ? "chevronUp" : "chevronDown"}
          onClick={onCollapsedToggle}
          size="sm"
          tooltip={collapseLabel}
          type="button"
          variant="ghost"
        />
        {errorIndicator}
        {actions !== null &&
          (actions.readFullResponse ||
            actions.repeatQuestion ||
            actions.setInterruptionBySpeaking) && (
            <VoicePlaybackMenu
              actions={actions}
              canReadFullResponse={canReadFullResponse}
              canRepeatQuestion={canRepeatQuestion}
              interruptionBySpeaking={interruptionBySpeaking}
            />
          )}
      </span>

      <div className={centerStyle({ withError: !!errorIndicator })}>
        {indicator ?? <LiveVoiceSessionIndicator />}
        <span className={statusStyle({ phase })}>{statusLabel}</span>
      </div>

      <span
        className={`${sideStyle({ withError: !!errorIndicator })} ${actionsStyle}`}
      >
        {actions !== null && (
          <>
            {canRetryPlayback && actions.retryPlayback && (
              <Button
                aria-label={voiceSessionActionLabels.retryPlayback}
                iconName="play"
                onClick={actions.retryPlayback}
                size="sm"
                tooltip={voiceSessionActionLabels.retryPlayback}
                type="button"
                variant="ghost"
              />
            )}
            {!interruptionBySpeaking && canTakeTurn && actions.takeTurn && (
              <Button
                aria-label={voiceSessionActionLabels.takeTurn}
                iconName="arrowsLeftRight"
                onClick={() => void actions.takeTurn?.()}
                size="sm"
                tooltip={voiceSessionActionLabels.takeTurn}
                type="button"
                variant="ghost"
              />
            )}
            {phase === "error"
              ? actions.reconnect && (
                  <Button
                    aria-label={voiceSessionActionLabels.reconnect}
                    iconName="rotate"
                    onClick={actions.reconnect}
                    size="sm"
                    tooltip="Reconnect"
                    type="button"
                    variant="ghost"
                  />
                )
              : phase === "paused"
                ? actions.resume && (
                    <Button
                      aria-label={voiceSessionActionLabels.resume}
                      iconName="play"
                      onClick={actions.resume}
                      size="sm"
                      tooltip="Resume"
                      type="button"
                      variant="ghost"
                    />
                  )
                : actions.setMicrophoneMuted && (
                    <Button
                      aria-label={microphoneLabel}
                      disabled={phase === "connecting"}
                      onClick={() =>
                        actions.setMicrophoneMuted?.(!microphoneMuted)
                      }
                      prefix={<MicrophoneIcon muted={microphoneMuted} />}
                      pressed={microphoneMuted}
                      size="sm"
                      tooltip={microphoneLabel}
                      type="button"
                      variant="ghost"
                    />
                  )}
            <Button
              aria-label={voiceSessionActionLabels.end}
              iconName="close"
              onClick={() => {
                actions.end();
                if (collapsed) {
                  onCollapsedEnd?.();
                }
              }}
              size="sm"
              tone="error"
              tooltip="End voice mode"
              type="button"
              variant="ghost"
            />
          </>
        )}
      </span>

      <span
        aria-atomic="true"
        aria-label="Voice status"
        aria-live="polite"
        className={visuallyHiddenStyle}
        role="status"
      >
        Voice status: {statusLabel}
      </span>
    </section>
  );
};

/** Reads the session straight from the store so the panel re-renders less. */
export const LiveVoiceDock = ({
  collapsed,
  errorIndicator,
  onCollapsedEnd,
  onCollapsedToggle,
}: {
  collapsed: boolean;
  errorIndicator?: ReactNode;
  onCollapsedEnd?: () => void;
  onCollapsedToggle: () => void;
}) => {
  const actions = useVoiceSessionActions();
  const canReadFullResponse = useVoiceSessionCanReadFullResponse();
  const canRepeatQuestion = useVoiceSessionCanRepeatQuestion();
  const canRetryPlayback = useVoiceSessionCanRetryPlayback();
  const canTakeTurn = useVoiceSessionCanTakeTurn();
  const interruptionBySpeaking = useVoiceSessionInterruptionBySpeaking();
  const microphoneMuted = useVoiceSessionMicrophoneMuted();
  const notice = useVoiceSessionNotice();
  const phase = useVoiceSessionPhase();

  if (phase === null) {
    return null;
  }

  return (
    <VoiceDock
      actions={actions}
      canReadFullResponse={canReadFullResponse}
      canRepeatQuestion={canRepeatQuestion}
      canRetryPlayback={canRetryPlayback}
      canTakeTurn={canTakeTurn}
      collapsed={collapsed}
      errorIndicator={errorIndicator}
      interruptionBySpeaking={interruptionBySpeaking}
      microphoneMuted={microphoneMuted}
      notice={notice}
      onCollapsedEnd={onCollapsedEnd}
      onCollapsedToggle={onCollapsedToggle}
      phase={phase}
    />
  );
};
