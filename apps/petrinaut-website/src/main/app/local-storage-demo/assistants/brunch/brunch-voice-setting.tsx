import { useId } from "react";

import { Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { OpenAIVoiceConfig } from "../../../voice-interview/voice-interview-control";

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) auto]",
  alignItems: "center",
  gap: "4",
  paddingX: "3",
  paddingY: "2.5",
});

const labelStyle = css({
  display: "block",
  marginBottom: "0.5",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[1.4]",
  color: "neutral.fg.heading",
});

const descriptionStyle = css({
  margin: "0",
  fontSize: "xs",
  lineHeight: "[1.6]",
  color: "neutral.fg.body",
});

export const BrunchVoiceSetting = ({
  brunchActive,
  openAIVoiceConfig,
  setVoiceEnabled,
  voiceEnabled,
  voicePreferenceReady,
}: {
  readonly brunchActive: boolean;
  readonly openAIVoiceConfig: OpenAIVoiceConfig | null | undefined;
  readonly setVoiceEnabled: (enabled: boolean) => void;
  readonly voiceEnabled: boolean;
  readonly voicePreferenceReady: boolean;
}) => {
  const id = useId();
  const description = !voicePreferenceReady
    ? "Loading your Voice preference…"
    : !brunchActive
      ? "Select Brunch to enable Voice."
      : openAIVoiceConfig === undefined
        ? "Checking whether Voice is available…"
        : openAIVoiceConfig === null
          ? "Voice is unavailable in this deployment."
          : "Make Voice mode available for Brunch conversations.";

  return (
    <div className={rowStyle}>
      <div>
        <span id={`${id}-label`} className={labelStyle}>
          Enable Voice
        </span>
        <p id={`${id}-description`} className={descriptionStyle}>
          {description}
        </p>
      </div>
      <Toggle
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        disabled={
          !voicePreferenceReady ||
          !brunchActive ||
          openAIVoiceConfig === undefined ||
          openAIVoiceConfig === null
        }
        onChange={setVoiceEnabled}
        size="sm"
        value={voiceEnabled}
      />
    </div>
  );
};
