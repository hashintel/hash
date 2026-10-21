import { useEffect, useRef, useState } from "react";

import { Button, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { AiAssistantIcon } from "../../../components/ai-assistant-icon";
import { AiVoiceModeButton } from "./ai-voice-mode-button";

const aiCtaModalLayerStyle = css({
  position: "absolute",
  inset: "0",
  zIndex: "modal",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8",
  pointerEvents: "none",
});

const aiCtaModalStyle = css({
  position: "relative",
  pointerEvents: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "6",
  width: "[min(600px, calc(100% - 48px))]",
  padding: "[32px]",
  borderRadius: "[24px]",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.a30",
  backgroundColor: "white.a95",
  boxShadow:
    "[0px 20px 60px rgba(15, 23, 42, 0.14), 0px 2px 8px rgba(15, 23, 42, 0.06)]",
  textAlign: "center",
  userSelect: "text",
  backdropFilter: "[blur(12px)]",
});

const aiCtaModalCloseStyle = css({
  position: "absolute",
  top: "3",
  right: "3",
});

const aiCtaModalIconStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[56px]",
  height: "[56px]",
  borderRadius: "2xl",
  backgroundColor: "blue.s20",
  boxShadow: "[0px 0px 0px 8px rgba(42, 128, 200, 0.08)]",
  color: "blue.s90",
});

const aiCtaModalCopyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  maxWidth: "[460px]",
});

const aiCtaModalTitleStyle = css({
  margin: "0",
  color: "neutral.s110",
  fontFamily: "[Inter Tight, Inter, sans-serif]",
  fontSize: "[24px]",
  fontWeight: "semibold",
  lineHeight: "[30px]",
});

const aiCtaModalInputStyle = css({
  overflow: "hidden",
  borderRadius: "[18px]",
  boxShadow:
    "[0px 0px 0px 1px rgba(0,0,0,0.06), 0px 8px 24px rgba(15, 23, 42, 0.06)]",
  "& > div": {
    minHeight: "[56px]",
    borderRadius: "[18px]",
    backgroundColor: "neutral.s00",
  },
});

export const AiCtaModal = ({
  bottomClearance,
  onDismiss,
  onStartVoiceMode,
  onSubmit,
  voiceModeAvailable,
}: {
  bottomClearance: number;
  onDismiss: () => void;
  onStartVoiceMode: () => void;
  onSubmit: (message: string) => void;
  voiceModeAvailable: boolean;
}) => {
  const [promptInput, setPromptInput] = useState("");

  const canSubmit = promptInput.trim().length > 0;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (formRef.current?.contains(target)) {
        return;
      }
      onDismiss();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss]);

  return (
    <div className={aiCtaModalLayerStyle} style={{ bottom: bottomClearance }}>
      <form
        ref={formRef}
        className={aiCtaModalStyle}
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedInput = promptInput.trim();
          if (!trimmedInput) {
            return;
          }

          onSubmit(trimmedInput);
        }}
      >
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className={aiCtaModalCloseStyle}
          onClick={onDismiss}
          aria-label="Dismiss"
          iconName="close"
        />
        <div className={aiCtaModalIconStyle}>
          <AiAssistantIcon size={32} />
        </div>
        <div className={aiCtaModalCopyStyle}>
          <h2 className={aiCtaModalTitleStyle}>
            Describe the process you want to create
          </h2>
        </div>
        <TextInput
          aria-label="Describe the process you want to create"
          className={aiCtaModalInputStyle}
          inputRef={inputRef}
          onChange={setPromptInput}
          placeholder="e.g. Model an SIR outbreak with recovery"
          size="lg"
          suffix={{
            variant: "subtle",
            content: canSubmit ? (
              <Button
                aria-label="Send first AI assistant message"
                className={css({ margin: "2" })}
                iconName="arrowUp"
                size="lg"
                tone="brand"
                tooltip="Send first AI assistant message"
                type="submit"
                variant="solid"
              />
            ) : voiceModeAvailable ? (
              <AiVoiceModeButton
                className={css({ margin: "2" })}
                onClick={onStartVoiceMode}
                size="lg"
              />
            ) : (
              <Button
                aria-label="Send first AI assistant message"
                className={css({ margin: "2" })}
                disabled
                iconName="arrowUp"
                size="lg"
                tone="brand"
                tooltip="Send first AI assistant message"
                type="submit"
                variant="solid"
              />
            ),
          }}
          value={promptInput}
        />
      </form>
    </div>
  );
};
