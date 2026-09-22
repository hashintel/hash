import { useId } from "react";

import { Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { OpenAIVoiceConfig } from "../voice-interview/voice-interview-control";
import type { AssistantSelection } from "./assistant-selection";

const sectionStyle = css({
  border: "[1px solid {colors.neutral.s40}]",
  borderRadius: "xl",
  overflow: "hidden",
  marginTop: "3",
});

const sectionTitleStyle = css({
  margin: "0",
  paddingX: "3",
  paddingY: "1.5",
  background: "neutral.s10",
  borderBottom: "[1px solid {colors.neutral.s40}]",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.fg.subtle",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) auto]",
  alignItems: "center",
  gap: "4",
  paddingX: "3",
  paddingY: "2.5",
  "& + &": { borderTop: "[1px solid {colors.neutral.s30}]" },
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

const AssistantSetting = ({
  description,
  disabled,
  label,
  onChange,
  value,
}: {
  readonly description: string;
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (enabled: boolean) => void;
  readonly value: boolean;
}) => {
  const id = useId();

  return (
    <div className={rowStyle}>
      <div>
        <span id={`${id}-label`} className={labelStyle}>
          {label}
        </span>
        <p id={`${id}-description`} className={descriptionStyle}>
          {description}
        </p>
      </div>
      <Toggle
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        disabled={disabled}
        onChange={onChange}
        size="sm"
        value={value}
      />
    </div>
  );
};

export const AssistantLabsSettings = ({
  assistantReady,
  brunchConfigured,
  brunchSelected,
  forceBrunch,
  openAIVoiceConfig,
  selectAssistant,
  setVoiceEnabled,
  voiceEnabled,
  voicePreferenceReady,
}: {
  readonly assistantReady: boolean;
  readonly brunchConfigured: boolean;
  readonly brunchSelected: boolean;
  readonly forceBrunch: boolean;
  readonly openAIVoiceConfig: OpenAIVoiceConfig | null | undefined;
  readonly selectAssistant: (selection: AssistantSelection) => void;
  readonly setVoiceEnabled: (enabled: boolean) => void;
  readonly voiceEnabled: boolean;
  readonly voicePreferenceReady: boolean;
}) => {
  const brunchDescription = !assistantReady
    ? "Loading your assistant preference…"
    : !brunchConfigured
      ? "Brunch is unavailable because this site has no Brunch endpoint configured."
      : forceBrunch
        ? "This document requires Brunch."
        : "Use Brunch instead of the stock Petrinaut assistant.";
  const voiceDescription = !voicePreferenceReady
    ? "Loading your Voice preference…"
    : !brunchSelected
      ? "Select Brunch to enable Voice."
      : openAIVoiceConfig === undefined
        ? "Checking whether Voice is available…"
        : openAIVoiceConfig === null
          ? "Voice is unavailable in this deployment."
          : "Make Voice mode available for Brunch conversations.";

  return (
    <section className={sectionStyle} aria-label="AI assistant">
      <h3 className={sectionTitleStyle}>AI assistant</h3>
      <AssistantSetting
        description={brunchDescription}
        disabled={!assistantReady || !brunchConfigured || forceBrunch}
        label="Use Brunch"
        onChange={(enabled) => selectAssistant(enabled ? "brunch" : "stock")}
        value={brunchSelected}
      />
      <AssistantSetting
        description={voiceDescription}
        disabled={
          !voicePreferenceReady ||
          openAIVoiceConfig === undefined ||
          !brunchSelected ||
          openAIVoiceConfig === null
        }
        label="Enable Voice"
        onChange={setVoiceEnabled}
        value={voiceEnabled}
      />
    </section>
  );
};
