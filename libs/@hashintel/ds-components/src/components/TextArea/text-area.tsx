import { useRef } from "react";
import { useMergeRefs } from "use-callback-ref";

import { cx } from "@hashintel/ds-helpers/css";

import { CharacterCount } from "../CharacterCount/character-count";
import { useFieldId } from "../Form/field-id-context";
import { textAreaRecipe } from "./text-area.recipe";

import type { SharedInputProps } from "../../util/form-shared";

type TextAreaProps = {
  /** An optional placeholder shown when the textarea is empty */
  placeholder?: string;
  /** The number of visible text rows. Acts as the minimum height when `autoResize` is set. */
  rows?: number;
  /** Disable editing. Unlike `disabled` this strips the input styles and displays the value as text. */
  readonly?: boolean;
  /** Which directions the user can manually resize the textarea. Ignored when `autoResize` is set. */
  resize?: "none" | "vertical" | "horizontal" | "both";
  /** Grow the textarea to fit its content instead of scrolling. Disables manual resizing. */
  autoResize?: boolean;
  /** subtle textareas have no border and display similarly to inline text */
  variant?: "default" | "subtle";
  /** Set the alignment of the text in the textarea */
  align?: "left" | "center" | "right";
  onClick?: React.MouseEventHandler<Element>;
  onKeyDown?: React.KeyboardEventHandler<Element>;
  /**
   * The character limit surfaced by the `CharacterCount`. This is a soft limit:
   * typing past it is allowed and the counter turns red, rather than being
   * truncated, so the caller can validate and warn. Setting this renders the
   * counter. It does not set the native `maxLength` attribute.
   */
  characterLimit?: number;
  spellcheck?: boolean;
  /** Whether the character counter reserves vertical space in the layout (defaults to false). */
  includeCharCountHeight?: boolean;
} & SharedInputProps<
  HTMLTextAreaElement,
  string | null | undefined,
  (value: string, event: React.ChangeEvent<HTMLTextAreaElement>) => void
> &
  React.AriaAttributes;

export const TextArea = ({
  placeholder,
  rows = 3,
  readonly,
  resize = "vertical",
  autoResize = false,
  variant = "default",
  align = "left",
  onClick,
  onKeyDown,
  characterLimit,
  spellcheck,
  includeCharCountHeight = false,
  className,
  name,
  value,
  onChange,
  onFocus,
  onBlur,
  size = "md",
  testId,
  htmlForId,
  ref,
  inputRef,
  disabled,
  required,
  invalid,
  autoFocus,
  ...ariaProps
}: TextAreaProps) => {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const mergedInputRef = useMergeRefs([
    internalRef,
    ...(inputRef ? [inputRef] : []),
  ]);
  const fieldIdFromContext = useFieldId();
  const inputId = htmlForId ?? fieldIdFromContext ?? undefined;

  const classes = textAreaRecipe({
    variant,
    size,
    align,
    invalid: !!invalid,
    disabled: !!disabled,
    // manual resizing conflicts with content-driven sizing, so disable it
    resize: autoResize ? "none" : resize,
    autoResize,
    includeCharCountHeight:
      includeCharCountHeight && characterLimit !== undefined,
  });

  if (readonly) {
    return (
      <span
        ref={ref}
        className={cx(classes.readonly, className)}
        data-testid={testId}
        {...ariaProps}
      >
        {value ?? ""}
      </span>
    );
  }

  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className={classes.wrapper}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click-to-focus container delegates to inner <textarea> */}
      <div
        className={cx(classes.root, className)}
        data-part="textarea-box"
        onClick={(event) => {
          if (!disabled) {
            internalRef.current?.focus();
            onClick?.(event);
          }
        }}
      >
        <textarea
          id={inputId}
          ref={mergedInputRef}
          name={name}
          value={value ?? ""}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={invalid ?? undefined}
          onChange={(event) => {
            onChange(event.target.value, event);
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          spellCheck={spellcheck}
          data-testid={testId}
          className={classes.textarea}
          autoFocus={autoFocus === true ? true : undefined}
          {...ariaProps}
        />
      </div>
      {variant === "subtle" && (
        <div className={classes.subtleOverlay} aria-hidden="true" />
      )}
      {characterLimit !== undefined && (
        <CharacterCount
          className={classes.charCount}
          charactersUsed={(value ?? "").length}
          maxLength={characterLimit}
          takesHeight={includeCharCountHeight}
        />
      )}
    </div>
  );
};
