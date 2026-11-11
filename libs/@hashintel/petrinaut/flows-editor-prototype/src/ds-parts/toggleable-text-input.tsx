/**
 * figma-ds Toggleable Text Input (`ToggleableTextInput` 9018:6856), with its pen off (ledger L361, L381; Alex, 9 Nov:
 * the pencil is optional). Measured from Figma: 8 px radius, 8 px text inset, 24 / 28 / 32 / 40 px for xs / sm / md /
 * lg, the subtle hover fill (#f9f9f9) on hover, and on edit the same fill with a faint 2 px ring. Our own rules stay
 * (Aakarsh, 4 Nov, Attio): the caret lands where the click did, no select-all, and the text never moves between rest,
 * hover and edit, so the ring sits outside the box rather than moving the inset as Figma's focus state does.
 *
 * Two variants: the field (titles, path names) and the card line (a step card's description, 2 px by 6 px padding
 * with a matching negative margin, so the card keeps its height).
 */
import { useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

const fieldStyle = css({
  borderRadius: "[8px]",
  backgroundColor: "[transparent]",
  outline: "none",
  transition: "[background-color 0.1s ease-in-out]",
  _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  _focusVisible: {
    backgroundColor: "neutral.bg.subtle.hover",
    boxShadow: "[0 0 0 2px var(--colors-neutral-a10)]",
  },
});

const editingStyle = css({
  "&, &:hover": {
    backgroundColor: "neutral.bg.subtle.hover",
    boxShadow: "[0 0 0 2px var(--colors-neutral-a10)]",
  },
});

const renameTextStyle = css({
  display: "inline-flex",
  alignItems: "center",
  height: "[28px]",
  paddingX: "[8px]",
  minWidth: "[0]",
  maxWidth: "[480px]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "text",
});

const renameInputStyle = css({
  height: "[28px]",
  paddingX: "[8px]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  fieldSizing: "content",
  minWidth: "[160px]",
  maxWidth: "[480px]",
});

/**
 * The card line: a step card's description. The side padding and negative margin cancel, so the text never moves;
 * the field starts 2 px below the title line, so the two never touch (Aakarsh, 4 Nov: "too crowded").
 */
const compactTextStyle = css({
  display: "block",
  minWidth: "[0]",
  marginX: "[-6px]",
  marginTop: "[2px]",
  marginBottom: "[-2px]",
  paddingX: "[6px]",
  paddingY: "[2px]",
  borderRadius: "[8px]",
  textStyle: "xs",
  lineHeight: "tight",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  cursor: "text",
  transition: "[background-color 0.1s ease-in-out]",
  _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  _focusVisible: {
    outline: "none",
    backgroundColor: "neutral.bg.subtle.hover",
  },
  "&[data-empty]": { color: "neutral.fg.subtle" },
});

const compactInputStyle = css({
  display: "block",
  width: "[calc(100% + 12px)]",
  marginX: "[-6px]",
  marginTop: "[2px]",
  marginBottom: "[-2px]",
  paddingX: "[6px]",
  paddingY: "[2px]",
  borderRadius: "[8px]",
  borderWidth: "[0]",
  textStyle: "xs",
  lineHeight: "tight",
  color: "neutral.fg.heading",
  backgroundColor: "neutral.bg.subtle.hover",
  outline: "none",
});

/** The character offset under a click in the shown text, or the end when the click missed it (or it is a placeholder). */
const caretOffset = (event: React.MouseEvent<HTMLElement>, value: string) => {
  const position = event.currentTarget.ownerDocument.caretPositionFromPoint(
    event.clientX,
    event.clientY,
  );
  return position && value && event.currentTarget.contains(position.offsetNode)
    ? Math.min(position.offset, value.length)
    : value.length;
};

/** Anything renamable: a subtle fill on hover, an input on click, Enter or blur saves, Esc cancels. No pen. */
export const ToggleableTextInput = ({
  value,
  onSave,
  label,
  placeholder,
  className,
  compact = false,
}: {
  value: string;
  onSave: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  /** A line of small text (a card's description) rather than a title. */
  compact?: boolean;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  // Where the caret goes when the field opens: where the click landed in the text, else the end (Attio: no select-all).
  const [caretAt, setCaretAt] = useState<number | null>(null);
  if (draft !== null) {
    const save = () => {
      const next = draft.trim();
      if (next && next !== value) {
        onSave(next);
      }
      setDraft(null);
    };
    return (
      <input
        // `nodrag`: typing in a canvas card must not drag the card.
        className={cx(
          compact
            ? compactInputStyle
            : cx(fieldStyle, renameInputStyle, editingStyle),
          "nodrag",
          className,
        )}
        value={draft}
        aria-label={label}
        placeholder={placeholder}
        data-rename-input
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- the user asked to rename; the caret goes to the name
        autoFocus
        onFocus={(event) => {
          const at = caretAt ?? event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(at, at);
        }}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            save();
          } else if (event.key === "Escape") {
            event.stopPropagation();
            setDraft(null);
          }
        }}
        onChange={(event) => setDraft(event.target.value)}
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${value || placeholder || ""}. Rename`}
      className={cx(
        compact ? compactTextStyle : cx(fieldStyle, renameTextStyle),
        className,
      )}
      data-rename
      data-empty={value ? undefined : true}
      onClick={(event) => {
        setCaretAt(caretOffset(event, value));
        setDraft(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setCaretAt(null);
          setDraft(value);
        }
      }}
    >
      {value || placeholder}
    </span>
  );
};
