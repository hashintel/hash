import { useId, useState } from "react";

import { Button, Icon, Select, Slider } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { SpeakerIcon } from "../speaker-icon";

import type {
  VoiceAudioSettingsActions,
  VoiceAudioSettingsState,
} from "../../../../../../../../react/voice-session/types";

const sectionStyle = css({
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  marginTop: "2",
  paddingTop: "2",
});
const headingStyle = css({
  width: "full",
  textAlign: "left",
  justifyContent: "flex-start",
  "& > span": { flex: "1" },
});
const fieldsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "2",
});
const labelStyle = css({ fontSize: "sm", color: "neutral.s100" });
const labelRowStyle = css({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "2",
});
const helpStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  lineHeight: "relaxed",
});
const speedStyle = css({
  '&:not([data-disabled]) [data-part="control"], &:not([data-disabled]) [data-part="thumb"]':
    {
      cursor: "pointer",
    },
  '& [data-part="value-text"]': {
    position: "absolute",
    right: "0",
    bottom: "0",
    lineHeight: "[16px]",
    fontVariantNumeric: "tabular-nums",
    "&::after": { content: '"×"' },
  },
  '& [data-part="control"]': { width: "[calc(100% - 36px)]" },
});
const defaultDevice = { value: "default", text: "System default" };

export const AudioSettings = ({
  actions,
  disabled,
  settings,
}: {
  actions: VoiceAudioSettingsActions;
  disabled: boolean;
  settings: VoiceAudioSettingsState;
}) => {
  const [devicesExpanded, setDevicesExpanded] = useState(false);
  const id = useId();
  const devices = settings.devices;
  const deviceDisabled = disabled || devices.busy;

  return (
    <>
      <div className={sectionStyle}>
        <div className={fieldsStyle}>
          <div className={labelRowStyle}>
            <span id={`${id}-voice-label`} className={labelStyle}>
              Voice
            </span>
            <span id={`${id}-voice-timing`} className={helpStyle}>
              Next session
            </span>
          </div>
          <Select
            aria-labelledby={`${id}-voice-label`}
            aria-describedby={
              settings.voiceSaveError
                ? `${id}-voice-timing ${id}-voice-help`
                : `${id}-voice-timing`
            }
            items={settings.voices}
            value={settings.voice}
            onChange={actions.setVoice}
            required
            size="sm"
            width="fullWidth"
          />
          {settings.voiceSaveError && (
            <span id={`${id}-voice-help`} className={helpStyle} role="status">
              {settings.voiceSaveError}
            </span>
          )}
          {settings.speed !== undefined && actions.setSpeed && (
            <div
              className={css({ position: "relative" })}
              role="group"
              aria-label="Speaking speed"
              aria-describedby={`${id}-speed-timing`}
            >
              <span
                id={`${id}-speed-timing`}
                className={css({
                  position: "absolute",
                  right: "0",
                  top: "0",
                  fontSize: "xs",
                  color: "neutral.s90",
                  lineHeight: "relaxed",
                })}
              >
                Next reply
              </span>
              <Slider
                className={speedStyle}
                label="Speed"
                disabled={disabled}
                min={0.25}
                max={1.5}
                step={0.25}
                value={settings.speed}
                onChange={actions.setSpeed}
                showValueText
                variant="plain"
              />
            </div>
          )}
        </div>
      </div>
      <div className={sectionStyle}>
        <Button
          className={headingStyle}
          aria-label="Devices"
          aria-expanded={devicesExpanded}
          aria-controls={`${id}-devices`}
          prefix={<Icon name="sliders" size="sm" />}
          suffix={
            <Icon
              name={devicesExpanded ? "chevronDown" : "chevronRight"}
              size="sm"
            />
          }
          onClick={() => setDevicesExpanded((expanded) => !expanded)}
          size="sm"
          variant="ghost"
        >
          Devices
        </Button>
        {devicesExpanded && (
          <div
            id={`${id}-devices`}
            className={fieldsStyle}
            aria-busy={devices.busy}
          >
            <span id={`${id}-input-label`} className={labelStyle}>
              Microphone
            </span>
            <Select
              aria-labelledby={`${id}-input-label`}
              disabled={deviceDisabled}
              items={[defaultDevice, ...devices.microphones]}
              value={
                devices.microphoneId === "" ? "default" : devices.microphoneId
              }
              onChange={(deviceId) =>
                actions.setMicrophoneDevice(
                  deviceId === "default" ? "" : deviceId,
                )
              }
              required
              size="sm"
              width="fullWidth"
            />
            <span id={`${id}-output-label`} className={labelStyle}>
              Speaker
            </span>
            <Select
              aria-labelledby={`${id}-output-label`}
              disabled={deviceDisabled || !devices.canSelectSpeaker}
              items={[defaultDevice, ...devices.speakers]}
              value={devices.speakerId === "" ? "default" : devices.speakerId}
              onChange={(deviceId) =>
                actions.setSpeakerDevice(deviceId === "default" ? "" : deviceId)
              }
              required
              size="sm"
              width="fullWidth"
            />
            {!devices.canSelectSpeaker && (
              <span className={helpStyle}>
                System default — change output in your system settings.
              </span>
            )}
            {devices.canRequestSpeaker && (
              <Button
                aria-label="Choose output"
                disabled={deviceDisabled}
                onClick={actions.requestSpeaker}
                prefix={<SpeakerIcon muted={false} />}
                size="sm"
                variant="ghost"
              >
                Choose output…
              </Button>
            )}
          </div>
        )}
      </div>
      {devices.message && (
        <p className={helpStyle} role="status">
          {devices.message}
        </p>
      )}
      {disabled && (
        <p className={helpStyle}>
          Audio controls are unavailable until Voice is connected.
        </p>
      )}
    </>
  );
};
