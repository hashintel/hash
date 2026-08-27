import { css, cva } from "@hashintel/ds-helpers/css";

import { AiAssistantIcon } from "../../../components/ai-assistant-icon";

import type { PetrinautAiInteractionMode } from "../../../types/ai-assistant-composer-control";

const modeGroupStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  padding: "1",
  borderRadius: "lg",
  backgroundColor: "neutral.s20",
});

const tabStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1",
    height: "[28px]",
    paddingX: "2",
    border: "none",
    borderRadius: "md",
    backgroundColor: "[transparent]",
    color: "neutral.s90",
    cursor: "pointer",
    fontSize: "xs",
    fontWeight: "medium",
    _focusVisible: {
      outline: "[2px solid token(colors.blue.s70)]",
      outlineOffset: "[2px]",
    },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "neutral.s00",
        boxShadow: "xs",
        color: "blue.s90",
      },
    },
  },
});

export const AiMicrophoneIcon = () => (
  <svg
    aria-hidden="true"
    fill="none"
    height="15"
    viewBox="0 0 16 16"
    width="15"
  >
    <path
      d="M5.5 4a2.5 2.5 0 0 1 5 0v4a2.5 2.5 0 0 1-5 0V4Zm-2 3.5V8a4.5 4.5 0 0 0 9 0v-.5M8 12.5V15m-2 0h4"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.4"
    />
  </svg>
);

export const AiInteractionModeTabs = ({
  mode,
  onModeChange,
}: {
  mode: PetrinautAiInteractionMode;
  onModeChange: (mode: PetrinautAiInteractionMode) => void;
}) => (
  <div aria-label="AI interaction mode" className={modeGroupStyle} role="group">
    <button
      aria-pressed={mode === "chat"}
      className={tabStyle({ selected: mode === "chat" })}
      type="button"
      onClick={() => onModeChange("chat")}
    >
      <AiAssistantIcon size={15} />
      Chat
    </button>
    <button
      aria-pressed={mode === "interview"}
      className={tabStyle({ selected: mode === "interview" })}
      type="button"
      onClick={() => onModeChange("interview")}
    >
      <AiMicrophoneIcon />
      Interview
    </button>
  </div>
);
