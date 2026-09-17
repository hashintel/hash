import { useRef, useState } from "react";

import { Button, Popover, Slider } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { voiceSessionActionLabels } from "../../../../components/voice-session-labels";
import { AudioSettings } from "./audio-popover/settings";
import { SpeakerIcon } from "./speaker-icon";

import type { VoiceSessionActions } from "../../../../../../../react/voice-session/store";
import type { VoiceAudioSettingsState } from "../../../../../../../react/voice-session/types";

const popoverStyle = css({
  width: "[236px]",
  maxWidth: "[calc(100vw - 32px)]",
  backgroundColor: "neutral.s00",
});

const popoverBodyStyle = css({
  margin: "[0 !important]",
  padding: "[8px !important]",
  boxShadow: "[none !important]",
  maxHeight: "[min(520px, var(--available-height, 70vh))]",
  overflowY: "auto",
});

const controlsStyle = css({
  display: "flex",
  flexDirection: "column",
});

const actionStyle = css({
  justifyContent: "flex-start",
  textAlign: "left",
  width: "full",
});

const speakerControlsStyle = css({
  display: "flex",
  width: "full",
  minWidth: "[0]",
  alignItems: "center",
  gap: "2",
});

const volumeStyle = css({
  flex: "1",
  minWidth: "[0]",
  '& [data-part="label"]': {
    position: "absolute",
    width: "[1px]",
    height: "[1px]",
    padding: "[0]",
    margin: "[-1px]",
    overflow: "hidden",
    clip: "[rect(0, 0, 0, 0)]",
    whiteSpace: "nowrap",
    borderWidth: "[0]",
  },
});

const volumeTextStyle = css({
  minWidth: "[34px]",
  color: "neutral.s80",
  fontSize: "xs",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
});

const advancedControlsStyle = cva({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5",
  },
  variants: {
    withDivider: {
      true: {
        marginTop: "2",
        paddingTop: "2",
        borderTopWidth: "thin",
        borderTopStyle: "solid",
        borderTopColor: "neutral.a20",
      },
    },
  },
});

export const AudioPopover = ({
  actions,
  settings,
  canReadFullResponse,
  canRepeatQuestion,
  interruptionBySpeaking,
  speakerControlsDisabled,
  speakerMuted,
  speakerVolume,
}: {
  actions: VoiceSessionActions;
  settings?: VoiceAudioSettingsState;
  canReadFullResponse: boolean;
  canRepeatQuestion: boolean;
  interruptionBySpeaking: boolean;
  speakerControlsDisabled: boolean;
  speakerMuted: boolean;
  speakerVolume: number;
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const speakerMuteLabel = speakerMuted
    ? voiceSessionActionLabels.unmuteSpeaker
    : voiceSessionActionLabels.muteSpeaker;
  const clampedSpeakerVolume = Math.min(1, Math.max(0, speakerVolume));
  const hasSpeakerControls = Boolean(
    actions.setSpeakerMuted || actions.setSpeakerVolume,
  );
  const hasAdvancedControls = Boolean(
    actions.repeatQuestion ||
    actions.readFullResponse ||
    actions.setInterruptionBySpeaking,
  );

  return (
    <>
      <Button
        ref={triggerRef}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={voiceSessionActionLabels.audioOptions}
        iconName="sliders"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        size="sm"
        tooltip={voiceSessionActionLabels.audioOptions}
        type="button"
        variant="ghost"
      />
      {open && (
        <Popover
          gapY={4}
          onClose={() => setOpen(false)}
          position="top-start"
          triggerRef={triggerRef}
        >
          <Popover.Container className={popoverStyle}>
            <Popover.Body className={popoverBodyStyle}>
              <div
                aria-label={voiceSessionActionLabels.audioControls}
                className={controlsStyle}
                role="group"
              >
                {hasSpeakerControls && (
                  <span
                    className={css({
                      fontSize: "xs",
                      color: "neutral.s90",
                      padding: "[0 8px 4px]",
                    })}
                  >
                    Speaker volume
                    {speakerMuted
                      ? " · Muted"
                      : clampedSpeakerVolume === 0
                        ? " · Silent"
                        : ""}
                  </span>
                )}
                {hasSpeakerControls && (
                  <div className={speakerControlsStyle}>
                    {actions.setSpeakerMuted && (
                      <Button
                        aria-label={speakerMuteLabel}
                        disabled={speakerControlsDisabled}
                        onClick={() => actions.setSpeakerMuted?.(!speakerMuted)}
                        prefix={<SpeakerIcon muted={speakerMuted} />}
                        pressed={speakerMuted}
                        size="sm"
                        tooltip={speakerMuteLabel}
                        type="button"
                        variant="ghost"
                      />
                    )}
                    {actions.setSpeakerVolume && (
                      <Slider
                        className={volumeStyle}
                        disabled={speakerControlsDisabled}
                        label={voiceSessionActionLabels.speakerVolume}
                        max={100}
                        min={0}
                        onChange={(volume) =>
                          actions.setSpeakerVolume?.(volume / 100)
                        }
                        step={5}
                        value={Math.round(clampedSpeakerVolume * 100)}
                        variant="plain"
                      />
                    )}
                    {actions.setSpeakerVolume && (
                      <span aria-hidden="true" className={volumeTextStyle}>
                        {Math.round(clampedSpeakerVolume * 100)}%
                      </span>
                    )}
                  </div>
                )}
                {settings && actions.audioSettings && (
                  <AudioSettings
                    actions={actions.audioSettings}
                    settings={settings}
                    disabled={speakerControlsDisabled}
                  />
                )}
                {hasAdvancedControls && (
                  <div
                    className={advancedControlsStyle({
                      withDivider: hasSpeakerControls,
                    })}
                  >
                    {actions.repeatQuestion && (
                      <Button
                        className={actionStyle}
                        disabled={!canRepeatQuestion}
                        onClick={actions.repeatQuestion}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {voiceSessionActionLabels.repeatQuestion}
                      </Button>
                    )}
                    {actions.readFullResponse && (
                      <Button
                        className={actionStyle}
                        disabled={!canReadFullResponse}
                        onClick={actions.readFullResponse}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {voiceSessionActionLabels.readFullResponse}
                      </Button>
                    )}
                    {actions.setInterruptionBySpeaking && (
                      <Button
                        className={actionStyle}
                        onClick={() =>
                          actions.setInterruptionBySpeaking?.(
                            !interruptionBySpeaking,
                          )
                        }
                        pressed={interruptionBySpeaking}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {voiceSessionActionLabels.interruptionBySpeaking}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Popover.Body>
          </Popover.Container>
        </Popover>
      )}
    </>
  );
};
