import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { usePortalContainerRef } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  STATUS_OPTIONS,
  statusCommentRequired,
  type StatusOption,
} from "../app-shell/site/opportunities";

// `popover` sits above the slide-over (`modal`), so the dialog appears over an
// open step detail panel rather than behind it.
const backdrop = css({
  position: "fixed",
  inset: "0",
  zIndex: "popover",
  bg: "neutral.a80",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  p: "4",
});
const panel = css({
  display: "flex",
  flexDirection: "column",
  w: "full",
  maxW: "lg",
  maxH: "[calc(100dvh-2rem)]",
  overflowY: "auto",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "lg",
  bg: "bgSolid.min",
  boxShadow: "2xl",
});
const headerRow = css({
  px: "5",
  py: "4",
  borderBottomWidth: "1px",
  borderColor: "bd.subtle",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "3",
});
const titleStyle = css({
  textStyle: "lg",
  fontWeight: "semibold",
  color: "fg.heading",
});
const subtitle = css({ textStyle: "xs", color: "fg.subtle" });
const body = css({
  px: "5",
  py: "4",
  display: "flex",
  flexDirection: "column",
  gap: "4",
});
const radioStack = css({ display: "flex", flexDirection: "column", gap: "2" });
const radioLabel = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  textStyle: "sm",
  color: "fg.heading",
  cursor: "pointer",
});
const textarea = css({
  minH: "28",
  resize: "vertical",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  borderRadius: "md",
  px: "3",
  py: "2",
  textStyle: "sm",
  color: "fg.heading",
  bg: "bgSolid.min",
});
const errorText = css({ textStyle: "xs", color: "status.error.fg.body" });
const footer = css({
  px: "5",
  py: "4",
  borderTopWidth: "1px",
  borderColor: "bd.subtle",
  display: "flex",
  justifyContent: "flex-end",
  gap: "2",
});
// Save is first in DOM (so it's the first tab stop after the textarea) but
// rendered on the right via flex order; Cancel keeps the left slot.
const saveOrder = css({ order: "1" });
const cancelOrder = css({ order: "0" });
const button = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  borderRadius: "sm",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  px: "2.5",
  py: "1",
  textStyle: "xs",
  lineHeight: "none",
  fontWeight: "medium",
  color: "fg.muted",
  cursor: "pointer",
  whiteSpace: "nowrap",
  _hover: { borderColor: "bd.strong", color: "fg.heading" },
});
const primaryButton = css({
  bg: "fg.heading",
  color: "bgSolid.min",
  borderColor: "fg.heading",
  _hover: { bg: "fg.muted", color: "bgSolid.min" },
});

const DEFAULT_STATUS: StatusOption = "investigation_started";

export interface StatusDialogProps {
  /** Subtitle shown under the heading (e.g. the step / opportunity title). */
  title: string;
  onClose: () => void;
  onSave: (status: { category: StatusOption; text: string }) => void;
}

/**
 * Centered modal for leaving a status update against a step/opportunity.
 * The form resets on each target change so status edits never inherit a prior
 * category or comment.
 */
export const StatusDialog = ({ title, onClose, onSave }: StatusDialogProps) => {
  const [category, setCategory] = useState<StatusOption>(DEFAULT_STATUS);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const portalRef = usePortalContainerRef();

  useEffect(() => {
    setCategory(DEFAULT_STATUS);
    setText("");
    setError(null);
    textareaRef.current?.focus();
  }, []);

  const selectCategory = (next: StatusOption) => {
    setCategory(next);
    if (!statusCommentRequired(next)) {
      setError(null);
    }
    textareaRef.current?.focus();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedText = text.trim();
    if (statusCommentRequired(category) && trimmedText.length === 0) {
      setError("Add a comment for this status.");
      textareaRef.current?.focus();
      return;
    }
    onSave({ category, text: trimmedText });
  };

  const dialog = (
    <div
      className={backdrop}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a native <dialog> UA positioning fights the flex-centered backdrop, so we use a div */}
      <form
        className={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="status-dialog-title"
        onSubmit={handleSubmit}
      >
        <div className={headerRow}>
          <div>
            <h2 id="status-dialog-title" className={titleStyle}>
              Status
            </h2>
            <p className={subtitle}>{title}</p>
          </div>
          <button
            type="button"
            className={button}
            aria-label="Close status"
            onClick={onClose}
          >
            x
          </button>
        </div>
        <div className={body}>
          <div className={radioStack}>
            {STATUS_OPTIONS.map((option) => (
              <label key={option.value} className={radioLabel}>
                <input
                  type="radio"
                  name="status-category"
                  value={option.value}
                  checked={category === option.value}
                  onChange={() => selectCategory(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            className={textarea}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (error && event.target.value.trim()) {
                setError(null);
              }
            }}
            placeholder="Add context, next actions, or why this is not feasible..."
            required={statusCommentRequired(category)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "status-dialog-error" : undefined}
          />
          {error && (
            <p id="status-dialog-error" className={errorText}>
              {error}
            </p>
          )}
        </div>
        <div className={footer}>
          <button
            type="submit"
            className={cx(button, primaryButton, saveOrder)}
          >
            Save status
          </button>
          <button
            type="button"
            className={cx(button, cancelOrder)}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );

  const container = portalRef?.current;
  return container ? createPortal(dialog, container) : dialog;
};

/** Speech-bubble glyph used by Status action buttons. */
export const StatusIcon = () => {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 2.5h8v5H6.2L3.5 9.5v-2H2v-5Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
};
