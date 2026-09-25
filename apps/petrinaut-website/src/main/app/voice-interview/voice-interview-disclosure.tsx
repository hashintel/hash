import { useEffect, useRef } from "react";

import { Button, Checkbox } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

const consentCardStyle = css({
  width: "full",
  padding: "4",
  border: "[1px solid {colors.neutral.a40}]",
  borderRadius: "[12px]",
  backgroundColor: "neutral.s00",
  color: "neutral.s115",
  boxShadow:
    "[0 0 0 1px rgba(0,0,0,0.02), 0 2px 6px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.09)]",
  _focus: { outline: "none" },
});
const disclosureHeadingStyle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  lineHeight: "tight",
});
const disclosureCopyStyle = css({
  color: "neutral.s90",
  fontSize: "xs",
  lineHeight: "relaxed",
});
const disclosureConsentStyle = css({
  width: "full",
  fontSize: "[13px]",
  color: "neutral.s115",
});
const consentActionStyle = css({
  height: "[28px]",
  paddingX: "2.5",
  fontSize: "[13px]",
});
const disclosureActionsStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "2",
  marginTop: "3",
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
      className={consentCardStyle}
      ref={disclosureRef}
      tabIndex={-1}
    >
      <h3
        className={css({
          fontSize: "sm",
          fontWeight: "semibold",
          marginBottom: "1.5",
        })}
      >
        Start a voice conversation
      </h3>
      <p
        className={css({
          color: "neutral.s90",
          fontSize: "[13px]",
          marginBottom: "3",
        })}
      >
        {experimental
          ? "OpenAI processes microphone audio for voice and transcription, and text to prepare briefs and summaries. Brunch saves the brief and its answer. Original words and spoken captions stay in this browser; Petrinaut does not save audio."
          : "OpenAI processes live audio and speaks the interviewer’s words. Petrinaut saves finalized answers—not audio."}
      </p>
      <Checkbox
        className={disclosureConsentStyle}
        label={
          experimental
            ? "Allow microphone audio for voice and transcription."
            : "I understand how voice data is handled."
        }
        onChange={onConsentChange}
        size="xs"
        tone="neutral"
        value={consented}
      />
      <div
        className={css({
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "2",
          marginTop: "[14px]",
        })}
      >
        <Button
          className={consentActionStyle}
          disabled={!consented || startDisabled}
          onClick={onStart}
          size="xs"
          tone="neutral"
          type="button"
        >
          Start voice
        </Button>
        {onCheckMicrophone && (
          <Button
            aria-describedby="voice-microphone-check-status"
            className={consentActionStyle}
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
          <Button
            className={`${consentActionStyle} ${css({ marginLeft: "auto" })}`}
            onClick={onExit}
            size="xs"
            type="button"
            variant="ghost"
          >
            Cancel
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
    </section>
  );
};

export const VoiceInterviewRetry = ({
  message,
  onExit,
  onRetry,
  retryDisabled = false,
}: {
  readonly message: string;
  readonly onExit: () => void;
  readonly onRetry: () => void;
  readonly retryDisabled?: boolean;
}) => {
  const retryRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <section
      aria-label="Voice mode retry"
      className={consentCardStyle}
      ref={retryRef}
      tabIndex={-1}
    >
      <div aria-live="polite">
        <h3 className={disclosureHeadingStyle}>
          {retryDisabled ? "Stopping voice…" : "Voice disconnected"}
        </h3>
        <p className={disclosureCopyStyle}>
          {retryDisabled
            ? "Wait a moment before trying again."
            : "Try again, or continue in chat."}
        </p>
      </div>
      <details className={css({ marginTop: "2", fontSize: "xs" })}>
        <summary className={css({ cursor: "pointer", color: "neutral.s90" })}>
          Technical details
        </summary>
        <p
          className={`${disclosureCopyStyle} ${css({ marginTop: "1", overflowWrap: "anywhere" })}`}
        >
          {message}
        </p>
      </details>
      <div className={disclosureActionsStyle}>
        <Button
          className={consentActionStyle}
          disabled={retryDisabled}
          onClick={onRetry}
          size="xs"
          tone="neutral"
          type="button"
        >
          Retry voice
        </Button>
        <Button
          className={consentActionStyle}
          onClick={onExit}
          size="xs"
          type="button"
          variant="ghost"
        >
          Back to chat
        </Button>
      </div>
    </section>
  );
};
