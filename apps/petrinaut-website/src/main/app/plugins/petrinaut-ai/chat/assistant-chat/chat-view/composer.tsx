import { useEffect, useRef } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { useAssistantPanel } from "@hashintel/petrinaut/ui/plugin";

const composerActionGlyphStyle = css({
  display: "inline-flex",
  animationName: "[petrinautComposerActionSwap]",
  animationDuration: "[140ms]",
  animationTimingFunction: "[cubic-bezier(0.2, 0.9, 0.3, 1)]",
  "@media (prefers-reduced-motion: reduce)": {
    animationName: "[none]",
  },
});

const composerActionButtonStyle = css({
  flexShrink: 0,
  width: "[30px]",
  height: "[30px]",
  minWidth: "[30px]",
  borderRadius: "[calc({radii.lg} - {spacing.1})]",
});

const composerStyle = css({
  display: "flex",
  alignItems: "flex-end",
  gap: "1",
  borderRadius: "lg",
  backgroundColor: "neutral.s10",
  border: "[1px solid {colors.neutral.bd.subtle}]",
  padding: "1",
  transition: "[border-color 150ms ease, box-shadow 150ms ease]",
  _focusWithin: {
    borderColor: "blue.s50",
    boxShadow: "[0 0 0 2px {colors.blue.a10}]",
  },
  "@media (prefers-reduced-motion: reduce)": {
    transition: "[none]",
  },
});

// Caps how tall the composer can auto-grow before it starts scrolling
// internally. Kept in sync with `maxHeight` below — the auto-grow effect
// reads this constant directly so the two can't drift.
const composerMaxHeight = 160;

const composerTextareaStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  minHeight: "[30px]",
  maxHeight: `[${composerMaxHeight}px]`,
  paddingX: "2",
  paddingY: "[5px]",
  border: "none",
  outline: "none",
  resize: "none",
  overflowY: "auto",
  backgroundColor: "[transparent]",
  color: "neutral.fg.body",
  fontFamily: "[inherit]",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "[1.4]",
  // Animates the height changes driven by the auto-grow effect, so adding a
  // line (Shift+Enter) or wrapping expands the box smoothly.
  transition: "[height 120ms ease]",
  "@media (prefers-reduced-motion: reduce)": {
    transition: "[none]",
  },
  _placeholder: {
    color: "neutral.s70",
  },
});

type ComposerAction = {
  disabled: boolean;
  glyph: "arrowUp" | "stopFilled";
  isSubmit: boolean;
  label: string;
  onClick?: () => void;
  tone: "brand" | "neutral";
  type: "button" | "submit";
  variant: "solid" | "subtle";
};

/**
 * The message form: an auto-growing textarea and one trailing action that is
 * Stop while busy and Send otherwise.
 */
export const AiAssistantComposer = ({
  busy,
  input,
  onInputChange,
  onStop,
  onSubmit,
  hasHistory,
}: {
  busy: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onStop: () => void;
  onSubmit: () => void;
  /** Whether the transcript already has messages to continue from. */
  hasHistory: boolean;
}) => {
  const { isOpen } = useAssistantPanel();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = input.trim().length > 0 && !busy;

  const action: ComposerAction = busy
    ? {
        disabled: false,
        glyph: "stopFilled",
        isSubmit: false,
        label: "Stop AI response",
        onClick: onStop,
        tone: "neutral",
        type: "button",
        variant: "subtle",
      }
    : {
        disabled: !canSubmit,
        glyph: "arrowUp",
        isSubmit: canSubmit,
        label: "Send message",
        tone: "brand",
        type: "submit",
        variant: "solid",
      };

  // Auto-grow the composer to fit its content (up to `composerMaxHeight`,
  // after which it scrolls internally). Resetting to `auto` before measuring
  // `scrollHeight` lets the box shrink again when text is removed; both writes
  // happen synchronously so the browser only paints the final height and the
  // CSS `height` transition animates the change. `scrollHeight` is a rounded
  // integer, so the height it yields can land a fraction of a pixel under the
  // real content and raise a scrollbar on a box that visibly fits; scrolling
  // is therefore only allowed once the content genuinely passes the cap.
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(contentHeight, composerMaxHeight)}px`;
    textarea.style.overflowY =
      contentHeight > composerMaxHeight ? "auto" : "hidden";
  }, [input, isOpen]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (canSubmit && submitter?.hasAttribute("data-ai-assistant-submit")) {
          onSubmit();
        }
      }}
    >
      <div className={composerStyle}>
        <textarea
          ref={inputRef}
          data-autofocus
          className={composerTextareaStyle}
          rows={1}
          value={input}
          onChange={(event) => onInputChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter inserts a newline (the textarea's
            // native behaviour, so we just let it through). The
            // `isComposing` guard stops an IME confirmation keystroke
            // from sending a half-finished message.
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (canSubmit) {
                onSubmit();
              }
            }
          }}
          placeholder={
            hasHistory
              ? "Continue iterating..."
              : "Describe the process you want to create"
          }
          aria-label="Message AI assistant"
        />
        <Button
          aria-label={action.label}
          className={composerActionButtonStyle}
          data-ai-assistant-submit={action.isSubmit || undefined}
          disabled={action.disabled}
          onClick={action.onClick}
          prefix={
            <span className={composerActionGlyphStyle} key={action.glyph}>
              <Icon name={action.glyph} size="sm" />
            </span>
          }
          size="sm"
          tone={action.tone}
          tooltip={action.label}
          type={action.type}
          variant={action.variant}
        />
      </div>
    </form>
  );
};
