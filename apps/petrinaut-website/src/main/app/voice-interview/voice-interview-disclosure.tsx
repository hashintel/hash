import { useEffect, useRef } from "react";

import { Button, Checkbox } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const VoiceModeIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="16"
    viewBox="0 0 20 20"
    width="16"
  >
    <path
      d="M3 8.5v3M6.5 5.5v9M10 3v14M13.5 6v8M17 8.5v3"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
    />
  </svg>
);

const disclosureFrameStyle = css({
  width: "full",
  padding: "2",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.a20",
  backgroundColor: "neutral.bg.subtle",
  color: "neutral.s100",
  _focus: { outline: "none" },
});
const disclosureCardStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "3",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a20",
  borderRadius: "xl",
  backgroundColor: "neutral.s00",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.03), 0px 8px 16px -12px rgba(0,0,0,0.18)]",
});
const disclosureHeaderStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
});
const disclosureIconStyle = css({
  display: "inline-flex",
  width: "7",
  height: "7",
  flexShrink: "0",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "lg",
  backgroundColor: "blue.a20",
  color: "blue.s90",
});
const disclosureTitleStyle = css({
  display: "flex",
  minWidth: "[0]",
  flexDirection: "column",
  gap: "0.5",
});
const disclosureHeadingStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  lineHeight: "tight",
});
const disclosureSubtitleStyle = css({ color: "neutral.s80", fontSize: "xs" });
const disclosureCopyStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  lineHeight: "relaxed",
});
const disclosureConsentStyle = css({
  width: "full",
  padding: "2",
  borderRadius: "lg",
  backgroundColor: "neutral.a10",
  color: "neutral.s100",
});
const disclosureActionsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
});
const disclosureStatusStyle = css({
  minHeight: "[18px]",
  color: "neutral.s80",
  fontSize: "xs",
  lineHeight: "relaxed",
});

export const VoiceInterviewDisclosure = ({
  checkingMicrophone = false,
  consented,
  microphoneCheck,
  onCheckMicrophone,
  onConsentChange,
  onStart,
  experimental = false,
  startDisabled = false,
  onExit,
}: {
  readonly checkingMicrophone?: boolean;
  readonly consented: boolean;
  readonly microphoneCheck: string;
  readonly onCheckMicrophone?: () => void;
  readonly onConsentChange: (consented: boolean) => void;
  readonly onStart: () => void;
  readonly experimental?: boolean;
  readonly startDisabled?: boolean;
  readonly onExit?: () => void;
}) => {
  const disclosureRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    disclosureRef.current?.focus();
  }, []);

  return (
    <section
      aria-label="Voice mode consent"
      className={disclosureFrameStyle}
      ref={disclosureRef}
      tabIndex={-1}
    >
      <div className={disclosureCardStyle}>
        <div className={disclosureHeaderStyle}>
          <span className={disclosureIconStyle}>
            <VoiceModeIcon />
          </span>
          <div className={disclosureTitleStyle}>
            <strong className={disclosureHeadingStyle}>
              {experimental
                ? "GPT-Live · Experimental interview"
                : "Start a voice conversation"}
            </strong>
            {!experimental && (
              <span className={disclosureSubtitleStyle}>
                Talk through your process with AI
              </span>
            )}
          </div>
        </div>
        {!experimental && (
          <p className={disclosureCopyStyle}>
            OpenAI processes live audio and speaks the interviewer’s words.
            Petrinaut saves finalized answers—not audio.
          </p>
        )}
        <Checkbox
          className={disclosureConsentStyle}
          label={
            experimental
              ? "Allow OpenAI to process microphone audio."
              : "I understand how voice data is handled."
          }
          onChange={onConsentChange}
          size="xs"
          tone="brand"
          value={consented}
        />
        <div className={disclosureActionsStyle}>
          <Button
            disabled={!consented || startDisabled}
            onClick={onStart}
            size="xs"
            tone="brand"
            type="button"
          >
            Start voice
          </Button>
          {onCheckMicrophone && (
            <Button
              aria-describedby="voice-microphone-check-status"
              loading={checkingMicrophone}
              onClick={onCheckMicrophone}
              size="xs"
              type="button"
              variant="subtle"
            >
              Test microphone
            </Button>
          )}
          {onExit && (
            <Button onClick={onExit} size="xs" type="button" variant="subtle">
              Exit experiment
            </Button>
          )}
        </div>
        {(!experimental || microphoneCheck) && (
          <div
            aria-atomic="true"
            aria-live="polite"
            className={disclosureStatusStyle}
            id="voice-microphone-check-status"
          >
            {microphoneCheck}
          </div>
        )}
      </div>
    </section>
  );
};
