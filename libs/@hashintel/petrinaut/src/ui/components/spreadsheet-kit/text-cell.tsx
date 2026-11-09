/**
 * A spreadsheet text cell with the kit's selection model: a pointer click
 * selects it, a second click (or a double-click, or Enter) opens the
 * editor, and Enter or leaving the cell closes it back to the selected
 * cell, Escape too. The text stays controlled by the owning table, which
 * hears every keystroke through `onChange` and learns how the edit ended
 * through `onCommit` and `onCancel`, so it can save on every key or hold a
 * draft and save once.
 */

import { useEffect, useRef, useState } from "react";

import { css, cx } from "@hashintel/ds-helpers/css";

import { cellButtonStyle, cellInputStyle } from "./form-table";

const restingCellStyle = css({
  height: "[28px]",
});

const placeholderStyle = css({
  color: "neutral.s60",
});

export interface TextCellProps {
  value: string;
  ariaLabel: string;
  /** Shown as the cell's tooltip; the owner styles the cell as invalid. */
  error?: string;
  /** Shown muted while the value is empty. */
  placeholder?: string;
  /** Enters edit mode when this becomes a fresh non-zero nonce. */
  autoEdit?: number;
  /** The text changed while editing. */
  onChange: (text: string) => void;
  /** Editing ended with Enter or by leaving the cell. */
  onCommit?: () => void;
  /** Editing ended with Escape. */
  onCancel?: () => void;
  /** The cell holds focus (resting or editing). */
  onFocusChange?: (focused: boolean) => void;
  /** Registers the resting button or the editor for the table's grid. */
  cellRef: (element: HTMLElement | null) => void;
  onCellKeyDown: React.KeyboardEventHandler;
  /** A plain focusable cell that never opens the editor. */
  readOnly?: boolean;
}

export const TextCell: React.FC<TextCellProps> = ({
  value,
  ariaLabel,
  error,
  placeholder,
  autoEdit = 0,
  onChange,
  onCommit,
  onCancel,
  onFocusChange,
  cellRef,
  onCellKeyDown,
  readOnly = false,
}) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wasFocusedOnPointerDownRef = useRef(false);
  const [editing, setEditing] = useState(autoEdit > 0 && !readOnly);
  const [seenAutoEdit, setSeenAutoEdit] = useState(autoEdit);
  if (autoEdit !== seenAutoEdit) {
    setSeenAutoEdit(autoEdit);
    if (autoEdit > 0 && !readOnly) {
      setEditing(true);
    }
  }

  const closeEditor = () => {
    setEditing(false);
    // After React commits the resting button.
    setTimeout(() => buttonRef.current?.focus(), 0);
  };

  // Escape leaves the edit. Handled natively at window capture, because a
  // host form may swallow in-form Escapes there (to spare its drawer)
  // before React's delegated handlers would run; registered while editing,
  // after such a listener, so it still sees the swallowed event.
  useEffect(() => {
    if (!editing) {
      return;
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && event.target === inputRef.current) {
        onCancel?.();
        closeEditor();
      }
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  });

  if (editing) {
    return (
      <input
        ref={(element) => {
          inputRef.current = element;
          cellRef(element);
        }}
        className={cellInputStyle}
        aria-label={ariaLabel}
        title={error}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            onCommit?.();
            closeEditor();
            return;
          }
          onCellKeyDown(event);
        }}
        onBlur={() => {
          setEditing(false);
          onCommit?.();
          onFocusChange?.(false);
        }}
        onFocus={(event) => {
          event.target.select();
          onFocusChange?.(true);
        }}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- entering edit mode is an explicit intent
        autoFocus
      />
    );
  }

  return (
    <button
      ref={(element) => {
        buttonRef.current = element;
        cellRef(element);
      }}
      type="button"
      className={cx(cellButtonStyle, restingCellStyle)}
      aria-label={ariaLabel}
      title={error}
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => onFocusChange?.(false)}
      onPointerDown={(event) => {
        wasFocusedOnPointerDownRef.current =
          document.activeElement === event.currentTarget;
      }}
      onClick={(event) => {
        // A keyboard "click" (Enter), a click on the selected cell, or the
        // second click of a double-click opens the editor.
        if (
          !readOnly &&
          (event.detail === 0 ||
            event.detail > 1 ||
            wasFocusedOnPointerDownRef.current)
        ) {
          setEditing(true);
        }
      }}
      onKeyDown={onCellKeyDown}
    >
      {value === "" && placeholder !== undefined ? (
        <span className={placeholderStyle}>{placeholder}</span>
      ) : (
        <span>{value}</span>
      )}
    </button>
  );
};
