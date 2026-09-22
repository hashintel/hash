import { useEffect, useEffectEvent, useId, useRef, useState } from "react";

import {
  Button,
  Icon,
  LoadingSpinner,
  Popover,
  Select,
  Slider,
} from "@hashintel/ds-components";
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
  alignItems: "center",
  justifyContent: "space-between",
  gap: "2",
});
const helpStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  lineHeight: "relaxed",
});
const sliderRowStyle = css({
  display: "flex",
  width: "full",
  minWidth: "[0]",
  alignItems: "center",
  gap: "2",
});
const speedStyle = css({
  flex: "1",
  minWidth: "[0]",
  '&:not([data-disabled]) [data-part="control"], &:not([data-disabled]) [data-part="thumb"]':
    {
      cursor: "pointer",
    },
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
const speedTextStyle = css({
  minWidth: "[34px]",
  color: "neutral.s80",
  fontSize: "xs",
  fontVariantNumeric: "tabular-nums",
  textAlign: "right",
});
const defaultDevice = { value: "default", text: "System default" };

export const AudioSettings = ({
  actions,
  disabled,
  settings,
  previewDisabledReason,
}: {
  actions: VoiceAudioSettingsActions;
  disabled: boolean;
  settings: VoiceAudioSettingsState;
  previewDisabledReason: string | null;
}) => {
  const [devicesExpanded, setDevicesExpanded] = useState(false);
  const [realTimeExpanded, setRealTimeExpanded] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const devices = settings.devices;
  const deviceDisabled = disabled || devices.busy;
  const stopPreviewOnUnmount = useEffectEvent(() => {
    actions.stopVoicePreview?.();
  });
  useEffect(() => () => stopPreviewOnUnmount(), []);

  return (
    <>
      <div className={sectionStyle}>
        <div className={fieldsStyle}>
          <div className={labelRowStyle}>
            <span id={`${id}-voice-label`} className={labelStyle}>
              Voice
            </span>
            <Button
              ref={infoRef}
              aria-label="About voice selection"
              aria-expanded={infoOpen}
              aria-haspopup="dialog"
              iconName="info"
              size="xs"
              variant="ghost"
              onClick={() => setInfoOpen((open) => !open)}
            />
            {infoOpen && (
              <Popover
                triggerRef={infoRef}
                position="top-end"
                onClose={() => setInfoOpen(false)}
              >
                <Popover.Container
                  className={css({
                    backgroundColor: "neutral.s00",
                    width: "[220px]",
                    maxWidth: "[calc(100vw - 24px)]",
                  })}
                >
                  <Popover.Body
                    className={css({
                      margin: "[0 !important]",
                      padding: "[8px !important]",
                      boxShadow: "[none !important]",
                    })}
                  >
                    <span className={helpStyle}>
                      The voice applies next time the agent is connected.
                      <br />
                      Preview when your mic is muted and the agent is idle.
                    </span>
                  </Popover.Body>
                </Popover.Container>
              </Popover>
            )}
          </div>
          <Select
            aria-labelledby={`${id}-voice-label`}
            aria-description="The voice applies next time the agent is connected."
            aria-describedby={[
              settings.voiceSaveError ? `${id}-voice-help` : "",
              previewDisabledReason ? `${id}-voice-blocked` : "",
            ]
              .filter(Boolean)
              .join(" ")}
            items={settings.voices}
            value={settings.voice}
            onChange={actions.setVoice}
            renderSelectedItem={(value) => (
              <span
                className={css({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "full",
                  gap: "2",
                })}
              >
                {settings.voices.find((voice) => voice.value === value)?.text ??
                  value}
                {settings.voicePreview === "loading" ? (
                  <span
                    aria-hidden="true"
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "1",
                      fontSize: "xs",
                      color: "neutral.s90",
                    })}
                  >
                    <LoadingSpinner size="xs" /> Loading…
                  </span>
                ) : (
                  settings.voicePreview === "playing" && (
                    <svg
                      aria-hidden="true"
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="currentColor"
                    >
                      <rect x="1" y="5" width="2" height="4" rx="1" />
                      <rect x="6" y="1" width="2" height="12" rx="1" />
                      <rect x="11" y="3" width="2" height="8" rx="1" />
                    </svg>
                  )
                )}
              </span>
            )}
            required
            size="sm"
            width="fullWidth"
          />
          {previewDisabledReason && (
            <span id={`${id}-voice-blocked`} className={helpStyle}>
              {previewDisabledReason}
            </span>
          )}
          <span role="status" className={css({ srOnly: true })}>
            {settings.voicePreview === "playing"
              ? "Voice preview playing"
              : settings.voicePreview === "loading"
                ? "Loading voice preview"
                : ""}
          </span>
          {settings.voicePreviewError && (
            <span className={helpStyle} role="status">
              {settings.voicePreviewError}
            </span>
          )}
          {settings.voiceSaveError && (
            <span id={`${id}-voice-help`} className={helpStyle} role="status">
              {settings.voiceSaveError}
            </span>
          )}
        </div>
      </div>
      <div className={sectionStyle}>
        <Button
          className={headingStyle}
          aria-label="Devices"
          aria-expanded={devicesExpanded}
          aria-controls={`${id}-devices`}
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
        {(devices.message || disabled) && (
          <div className={fieldsStyle}>
            {devices.message && (
              <span className={helpStyle} role="status">
                {devices.message}
              </span>
            )}
            {disabled && (
              <span className={helpStyle}>
                Audio controls are unavailable until Voice is connected.
              </span>
            )}
          </div>
        )}
      </div>
      {settings.speed !== undefined && actions.setSpeed && (
        <div className={sectionStyle}>
          <Button
            className={headingStyle}
            aria-label="Real-time"
            aria-expanded={realTimeExpanded}
            aria-controls={`${id}-real-time`}
            suffix={
              <Icon
                name={realTimeExpanded ? "chevronDown" : "chevronRight"}
                size="sm"
              />
            }
            onClick={() => setRealTimeExpanded((expanded) => !expanded)}
            size="sm"
            variant="ghost"
          >
            Real-time
          </Button>
          {realTimeExpanded && (
            <div id={`${id}-real-time`} className={fieldsStyle}>
              <span className={labelStyle}>Speed</span>
              <div className={sliderRowStyle}>
                <Slider
                  className={speedStyle}
                  label="Speed"
                  disabled={disabled}
                  min={0.25}
                  max={1.5}
                  step={0.25}
                  value={settings.speed}
                  onChange={actions.setSpeed}
                  variant="plain"
                />
                <span aria-hidden="true" className={speedTextStyle}>
                  {settings.speed}×
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
