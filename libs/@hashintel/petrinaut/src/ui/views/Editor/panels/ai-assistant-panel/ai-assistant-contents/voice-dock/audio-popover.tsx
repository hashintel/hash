import { useRef, useState } from "react";

import { Button, Popover, Slider } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { voiceSessionActionLabels } from "../../../../components/voice-session-labels";

import type { VoiceSessionActions } from "../../../../../../../react/voice-session/store";

const popoverStyle = css({
  width: "[240px]",
});

const controlsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
});

const actionStyle = css({
  justifyContent: "flex-start",
  width: "full",
});

const volumeStyle = css({
  width: "full",
  paddingX: "2",
  paddingY: "1",
});

export const AudioPopover = ({
  actions,
  canReadFullResponse,
  canRepeatQuestion,
  interruptionBySpeaking,
  speakerMuted,
  speakerVolume,
}: {
  actions: VoiceSessionActions;
  canReadFullResponse: boolean;
  canRepeatQuestion: boolean;
  interruptionBySpeaking: boolean;
  speakerMuted: boolean;
  speakerVolume: number;
}) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const speakerMuteLabel = speakerMuted
    ? voiceSessionActionLabels.unmuteSpeaker
    : voiceSessionActionLabels.muteSpeaker;

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
          onClose={() => setOpen(false)}
          position="top-start"
          triggerRef={triggerRef}
        >
          <Popover.Container className={popoverStyle}>
            <Popover.Header title={voiceSessionActionLabels.audioOptions} />
            <Popover.Body>
              <div
                aria-label={voiceSessionActionLabels.audioControls}
                className={controlsStyle}
                role="group"
              >
                {actions.setSpeakerMuted && (
                  <Button
                    className={actionStyle}
                    onClick={() => actions.setSpeakerMuted?.(!speakerMuted)}
                    pressed={speakerMuted}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {speakerMuteLabel}
                  </Button>
                )}
                {actions.setSpeakerVolume && (
                  <Slider
                    className={volumeStyle}
                    label={voiceSessionActionLabels.speakerVolume}
                    max={1}
                    min={0}
                    onChange={(volume) => actions.setSpeakerVolume?.(volume)}
                    showValueText
                    step={0.05}
                    value={Math.min(1, Math.max(0, speakerVolume))}
                    variant="plain"
                  />
                )}
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
            </Popover.Body>
          </Popover.Container>
        </Popover>
      )}
    </>
  );
};
