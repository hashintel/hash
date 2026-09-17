import { useId, useState } from "react";

import { Button, Select, Slider } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

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
  justifyContent: "space-between",
});
const fieldsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "2",
});
const labelStyle = css({ fontSize: "sm", color: "neutral.s100" });
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
    top: "0",
    fontVariantNumeric: "tabular-nums",
  },
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
  const [section, setSection] = useState<"voice" | "devices" | null>(null);
  const id = useId();
  const devices = settings.devices;
  const deviceDisabled = disabled || devices.busy;

  return (
    <>
      <div className={sectionStyle}>
        <Button
          className={headingStyle}
          aria-expanded={section === "voice"}
          aria-controls={`${id}-voice`}
          iconName={section === "voice" ? "chevronDown" : "chevronRight"}
          iconPosition="right"
          onClick={() => setSection(section === "voice" ? null : "voice")}
          size="sm"
          variant="ghost"
        >
          {settings.speed !== undefined && actions.setSpeed
            ? "Voice & speed"
            : "Voice"}
        </Button>
        {section === "voice" && (
          <div id={`${id}-voice`} className={fieldsStyle}>
            <span id={`${id}-voice-label`} className={labelStyle}>
              Voice
            </span>
            <Select
              aria-labelledby={`${id}-voice-label`}
              aria-describedby={`${id}-voice-help`}
              items={settings.voices}
              value={settings.voice}
              onChange={actions.setVoice}
              required
              size="sm"
              width="fullWidth"
            />
            <span id={`${id}-voice-help`} className={helpStyle}>
              {settings.voiceSaveError ?? "Saved for next session."}
            </span>
            {settings.speed !== undefined && actions.setSpeed && (
              <>
                <Slider
                  className={speedStyle}
                  label="Speaking speed"
                  disabled={disabled}
                  min={0.25}
                  max={1.5}
                  step={0.25}
                  value={settings.speed}
                  onChange={actions.setSpeed}
                  showValueText
                  variant="plain"
                />
                <span className={helpStyle}>Applies to the next response.</span>
              </>
            )}
          </div>
        )}
      </div>
      <div className={sectionStyle}>
        <Button
          className={headingStyle}
          aria-expanded={section === "devices"}
          aria-controls={`${id}-devices`}
          iconName={section === "devices" ? "chevronDown" : "chevronRight"}
          iconPosition="right"
          onClick={() => {
            setSection(section === "devices" ? null : "devices");
            if (section !== "devices") actions.refreshDevices();
          }}
          size="sm"
          variant="ghost"
        >
          Audio devices
        </Button>
        {section === "devices" && (
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
                disabled={deviceDisabled}
                onClick={actions.requestSpeaker}
                size="sm"
                variant="ghost"
              >
                Choose another speaker…
              </Button>
            )}
            <Button
              disabled={deviceDisabled}
              onClick={actions.refreshDevices}
              size="sm"
              variant="ghost"
            >
              Refresh devices
            </Button>
            <span className={helpStyle}>
              Disconnected devices switch to system default.
            </span>
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
