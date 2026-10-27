import { useId } from "react";

import { Toggle } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { OpenAIVoiceConfig } from "../plugins/brunch/voice/session/voice-interview-control";

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
  readonly description?: string;
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
        {description !== undefined && (
          <p id={`${id}-description`} className={descriptionStyle}>
            {description}
          </p>
        )}
      </div>
      <Toggle
        aria-labelledby={`${id}-label`}
        aria-describedby={
          description === undefined ? undefined : `${id}-description`
        }
        disabled={disabled}
        onChange={onChange}
        size="sm"
        value={value}
      />
    </div>
  );
};

/**
 * Brunch's experiments. They apply while the editor shows Brunch's assistant,
 * which the user chooses in General.
 */
export const AssistantLabsSettings = ({
  brunchActive,
  interviewBudgetEnabled,
  interviewBudgetPreferenceReady,
  openAIVoiceConfig,
  realtimeEnabled,
  realtimePreferenceReady,
  setInterviewBudgetEnabled,
  setRealtimeEnabled,
  setVoiceEnabled,
  voiceEnabled,
  voicePreferenceReady,
  wordsEnabled,
  wordsPreferenceReady,
  setWordsEnabled,
}: {
  /** The editor shows Brunch's assistant. */
  readonly brunchActive: boolean;
  readonly interviewBudgetEnabled: boolean;
  readonly interviewBudgetPreferenceReady: boolean;
  readonly openAIVoiceConfig: OpenAIVoiceConfig | null | undefined;
  readonly realtimeEnabled: boolean;
  readonly realtimePreferenceReady: boolean;
  readonly setInterviewBudgetEnabled: (enabled: boolean) => void;
  readonly setRealtimeEnabled: (enabled: boolean) => void;
  readonly setVoiceEnabled: (enabled: boolean) => void;
  readonly voiceEnabled: boolean;
  readonly voicePreferenceReady: boolean;
  readonly wordsEnabled: boolean;
  readonly wordsPreferenceReady: boolean;
  readonly setWordsEnabled: (enabled: boolean) => void;
}) => {
  const voiceDescription = !voicePreferenceReady
    ? "Loading your Voice preference…"
    : !brunchActive
      ? "Available while Brunch is the AI assistant."
      : openAIVoiceConfig === undefined
        ? "Checking whether Voice is available…"
        : openAIVoiceConfig === null
          ? "Voice is unavailable in this deployment."
          : "Talk to Brunch by voice.";

  return (
    <section className={sectionStyle} aria-label="Brunch">
      <h3 className={sectionTitleStyle}>Brunch</h3>
      {brunchActive && (
        <AssistantSetting
          description="Choose how many questions Brunch asks before wrapping up."
          disabled={!interviewBudgetPreferenceReady}
          label="Interview length"
          onChange={setInterviewBudgetEnabled}
          value={interviewBudgetEnabled}
        />
      )}
      <AssistantSetting
        description={voiceDescription}
        disabled={
          !voicePreferenceReady ||
          openAIVoiceConfig === undefined ||
          !brunchActive ||
          openAIVoiceConfig === null
        }
        label="Enable Voice"
        onChange={setVoiceEnabled}
        value={voiceEnabled}
      />
      {brunchActive && voicePreferenceReady && voiceEnabled && (
        <AssistantSetting
          description="Use the alternative voice engine if Voice isn’t working well."
          disabled={!realtimePreferenceReady || !openAIVoiceConfig}
          label="Realtime mode"
          onChange={setRealtimeEnabled}
          value={realtimeEnabled}
        />
      )}
      {brunchActive && voicePreferenceReady && voiceEnabled && (
        <AssistantSetting
          description="Help recognize and pronounce names and terms."
          disabled={!wordsPreferenceReady}
          label="Custom words"
          onChange={setWordsEnabled}
          value={wordsEnabled}
        />
      )}
    </section>
  );
};
