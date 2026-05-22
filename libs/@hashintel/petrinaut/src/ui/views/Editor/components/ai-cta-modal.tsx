import { useRef, useEffect } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { AiAssistantIcon } from "../../../components/ai-assistant-icon";
import { Input } from "../../../components/input";

const emptyAiHeroLayerStyle = css({
  position: "absolute",
  inset: "0",
  zIndex: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8",
  pointerEvents: "none",
});

const emptyAiHeroStyle = css({
  pointerEvents: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "5",
  width: "[min(560px, calc(100% - 48px))]",
  padding: "[28px]",
  borderRadius: "[24px]",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "blue.a30",
  backgroundColor: "white.a95",
  boxShadow:
    "[0px 20px 60px rgba(15, 23, 42, 0.18), 0px 2px 8px rgba(15, 23, 42, 0.08), inset 0px 1px 0px rgba(255, 255, 255, 0.9)]",
  textAlign: "center",
  userSelect: "text",
  backdropFilter: "[blur(14px)]",
});

const emptyAiHeroIconStyle = css({
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

const emptyAiHeroCopyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  maxWidth: "[420px]",
});

const emptyAiHeroTitleStyle = css({
  margin: "0",
  color: "neutral.s110",
  fontFamily: "[Inter Tight, Inter, sans-serif]",
  fontSize: "[24px]",
  fontWeight: "semibold",
  lineHeight: "[30px]",
});

const emptyAiHeroFormStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "full",
  padding: "1.5",
  borderRadius: "[20px]",
  backgroundColor: "neutral.s00",
  boxShadow:
    "[0px 0px 0px 1px rgba(15, 23, 42, 0.08), 0px 12px 28px rgba(15, 23, 42, 0.12)]",
});

const emptyAiHeroInputStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  height: "[48px]",
  borderColor: "[transparent]",
  backgroundColor: "[transparent]",
  boxShadow: "[none]",
  fontSize: "base",
  _hover: {
    borderColor: "[transparent]",
  },
  _focus: {
    borderColor: "[transparent]",
    boxShadow: "[none]",
  },
  _active: {
    borderColor: "[transparent]",
    boxShadow: "[none]",
  },
});

export const EmptyAiHero = ({
  bottomClearance,
  input,
  onInputChange,
  onSubmit,
}: {
  bottomClearance: number;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (message: string) => void;
}) => {
  const canSubmit = input.trim().length > 0;
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className={emptyAiHeroLayerStyle} style={{ bottom: bottomClearance }}>
      <form
        className={emptyAiHeroStyle}
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedInput = input.trim();
          if (!trimmedInput) {
            return;
          }

          onSubmit(trimmedInput);
        }}
      >
        <div className={emptyAiHeroIconStyle}>
          <AiAssistantIcon size={32} />
        </div>
        <div className={emptyAiHeroCopyStyle}>
          <h2 className={emptyAiHeroTitleStyle}>
            Describe the process you want to create
          </h2>
        </div>
        <div className={emptyAiHeroFormStyle}>
          <Input
            ref={inputRef}
            className={emptyAiHeroInputStyle}
            value={input}
            onChange={(event) => onInputChange(event.currentTarget.value)}
            placeholder="e.g. Model an SIR outbreak with recovery"
            aria-label="Describe the process you want to create"
            size="lg"
          />
          <Button
            type="submit"
            size="lg"
            variant="solid"
            tone="brand"
            disabled={!canSubmit}
            aria-label="Send first AI assistant message"
            iconName="arrowUp"
            tooltip="Send first AI assistant message"
          />
        </div>
      </form>
    </div>
  );
};
