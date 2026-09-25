import { useEffect, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import {
  useVoiceSessionActions,
  useVoiceSessionAudioSettings,
  useVoiceSessionCanReadFullResponse,
  useVoiceSessionCanRepeatQuestion,
  useVoiceSessionCanRetryPlayback,
  useVoiceSessionCanTakeTurn,
  useVoiceSessionInterruptionBySpeaking,
  useVoiceSessionMicrophoneMuted,
  useVoiceSessionNotice,
  useVoiceSessionPhase,
  useVoiceSessionSpeakerMuted,
  useVoiceSessionSpeakerVolume,
} from "../../../../../../react/voice-session/use-voice-session";
import { LiveVoiceSessionIndicator } from "../../../components/voice-session-indicator";
import {
  voiceSessionActionLabels,
  voiceSessionStatusLabel,
  voiceSetupLabels,
} from "../../../components/voice-session-labels";
import { aiFooterMinHeight } from "./footer-height";
import { AudioPopover } from "./voice-dock/audio-popover";
import { MicrophoneIcon } from "./voice-dock/microphone-icon";
import { EndIcon, StopIcon } from "./voice-dock/session-action-icons";

import type { VoiceSessionActions } from "../../../../../../react/voice-session/store";
import type { VoiceAudioSettingsState } from "../../../../../../react/voice-session/types";
import type { PetrinautAiVoiceSessionPhase } from "../../../../../types/ai-assistant-composer-control";
import type { ReactNode } from "react";

const dockStyle = css({
  display: "grid",
  flexShrink: 0,
  boxSizing: "border-box",
  minHeight: `[${aiFooterMinHeight}px]`,
  gridTemplateColumns: "[auto minmax(0, 1fr) auto]",
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

const sideStyle = css({
  display: "flex",
  flexShrink: "0",
  alignItems: "center",
});

const centerStyle = css({
  display: "flex",
  minWidth: "[0]",
  alignItems: "center",
  justifyContent: "center",
  gap: "2",
});

const indicatorStyle = css({
  display: "flex",
  flexShrink: "0",
});

const statusStyle = cva({
  base: {
    fontSize: "xs",
    fontWeight: "medium",
    minWidth: "[0]",
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

type VoiceDockSharedProps = {
  audioSettings?: VoiceAudioSettingsState;
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
  speakerMuted: boolean;
  speakerVolume: number;
};

export type VoiceDockProps = VoiceDockSharedProps &
  (
    | {
        actions: null;
        assistantBusy?: never;
        onStop?: never;
        purpose: "setup";
      }
    | {
        actions: VoiceSessionActions | null;
        assistantBusy: boolean;
        onStop: () => void;
        purpose?: "session";
      }
  );

/**
 * The compact Voice surface inside the assistant panel: one ribbon for setup
 * or live-session status and controls.
 */
export const VoiceDock = ({
  actions,
  audioSettings,
  assistantBusy,
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
  onStop,
  phase,
  purpose = "session",
  speakerMuted,
  speakerVolume,
}: VoiceDockProps) => {
  const [showStatusText, setShowStatusText] = useState(true);
  const previewDisabledReason =
    phase === "connecting" || phase === "error" || phase === "paused"
      ? "Connect Voice to preview."
      : assistantBusy || phase === "speaking" || phase === "thinking"
        ? "Wait for the agent to finish."
        : !microphoneMuted
          ? "Mute your mic to preview."
          : (audioSettings?.voicePreviewUnavailable ?? null);
  const stopPreview = actions?.audioSettings?.stopVoicePreview;
  useEffect(() => {
    if (previewDisabledReason) stopPreview?.();
  }, [previewDisabledReason, stopPreview]);
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
  const speakerControlsDisabled = phase === "connecting" || phase === "error";

  return (
    <section
      aria-label={
        purpose === "setup" ? voiceSetupLabels.region : "Voice session"
      }
      className={dockStyle}
      data-phase={phase}
      data-testid="ai-voice-dock"
    >
      <span className={sideStyle} data-part="left-actions">
        <Button
          aria-label={collapseLabel}
          iconName={collapsed ? "chevronUp" : "chevronDown"}
          onClick={onCollapsedToggle}
          size="sm"
          tooltip={collapseLabel}
          type="button"
          variant="ghost"
        />
        {actions !== null &&
          (actions.readFullResponse ||
            actions.repeatQuestion ||
            actions.setInterruptionBySpeaking ||
            actions.setSpeakerMuted ||
            actions.setSpeakerVolume ||
            actions.audioSettings) && (
            <AudioPopover
              actions={actions}
              settings={audioSettings}
              canReadFullResponse={canReadFullResponse}
              canRepeatQuestion={canRepeatQuestion}
              interruptionBySpeaking={interruptionBySpeaking}
              speakerControlsDisabled={speakerControlsDisabled}
              speakerMuted={speakerMuted}
              speakerVolume={speakerVolume}
              previewDisabledReason={previewDisabledReason}
              showStatusText={showStatusText}
              setShowStatusText={setShowStatusText}
            />
          )}
        {errorIndicator}
      </span>

      <div className={centerStyle} data-part="shrinkable-status">
        <span className={indicatorStyle} data-part="fixed-indicator">
          {indicator ?? <LiveVoiceSessionIndicator />}
        </span>
        {(showStatusText ||
          notice ||
          purpose === "setup" ||
          phase === "error" ||
          phase === "muted" ||
          phase === "paused" ||
          phase === "connecting") && (
          <span className={statusStyle({ phase })} data-part="visible-status">
            {statusLabel}
          </span>
        )}
      </div>

      <span
        className={`${sideStyle} ${actionsStyle}`}
        data-part="right-actions"
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
            {phase === "error" && actions.reconnect && (
              <Button
                aria-label={voiceSessionActionLabels.reconnect}
                iconName="rotate"
                onClick={actions.reconnect}
                size="sm"
                tooltip="Reconnect"
                type="button"
                variant="ghost"
              />
            )}
            {phase === "paused" && actions.resume && (
              <Button
                aria-label={voiceSessionActionLabels.resume}
                iconName="play"
                onClick={actions.resume}
                size="sm"
                tooltip="Resume"
                type="button"
                variant="ghost"
              />
            )}
            {actions.setMicrophoneMuted && (
              <Button
                aria-label={microphoneLabel}
                disabled={
                  phase === "connecting" ||
                  phase === "error" ||
                  phase === "paused"
                }
                onClick={() => {
                  if (microphoneMuted) stopPreview?.();
                  actions.setMicrophoneMuted?.(!microphoneMuted);
                }}
                prefix={<MicrophoneIcon muted={microphoneMuted} />}
                pressed={microphoneMuted}
                size="sm"
                tooltip={microphoneLabel}
                type="button"
                variant="ghost"
              />
            )}
            {assistantBusy && (
              <Button
                aria-label={voiceSessionActionLabels.stop}
                className={css({
                  width: "[28px]",
                  height: "[28px]",
                  minWidth: "[28px]",
                  borderRadius: "md",
                })}
                onClick={onStop}
                prefix={<StopIcon />}
                size="sm"
                tooltip={voiceSessionActionLabels.stop}
                type="button"
                variant="ghost"
              />
            )}
            <Button
              aria-label={voiceSessionActionLabels.end}
              onClick={() => {
                actions.end();
                if (collapsed) {
                  onCollapsedEnd?.();
                }
              }}
              prefix={<EndIcon />}
              size="sm"
              tone="error"
              tooltip={voiceSessionActionLabels.end}
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
        data-part="live-status"
        role="status"
      >
        Voice status: {statusLabel}
      </span>
    </section>
  );
};

/** Reads the session straight from the store so the panel re-renders less. */
export const LiveVoiceDock = ({
  assistantBusy,
  collapsed,
  errorIndicator,
  onCollapsedEnd,
  onCollapsedToggle,
  onStop,
}: {
  assistantBusy: boolean;
  collapsed: boolean;
  errorIndicator?: ReactNode;
  onCollapsedEnd?: () => void;
  onCollapsedToggle: () => void;
  onStop: () => void;
}) => {
  const actions = useVoiceSessionActions();
  const audioSettings = useVoiceSessionAudioSettings();
  const canReadFullResponse = useVoiceSessionCanReadFullResponse();
  const canRepeatQuestion = useVoiceSessionCanRepeatQuestion();
  const canRetryPlayback = useVoiceSessionCanRetryPlayback();
  const canTakeTurn = useVoiceSessionCanTakeTurn();
  const interruptionBySpeaking = useVoiceSessionInterruptionBySpeaking();
  const microphoneMuted = useVoiceSessionMicrophoneMuted();
  const notice = useVoiceSessionNotice();
  const phase = useVoiceSessionPhase();
  const speakerMuted = useVoiceSessionSpeakerMuted();
  const speakerVolume = useVoiceSessionSpeakerVolume();

  if (phase === null) {
    return null;
  }

  return (
    <VoiceDock
      actions={actions}
      audioSettings={audioSettings}
      assistantBusy={assistantBusy}
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
      onStop={onStop}
      phase={phase}
      speakerMuted={speakerMuted}
      speakerVolume={speakerVolume}
    />
  );
};
