import { cx } from "@hashintel/ds-helpers/css";
import { useRef, useState } from "react";

import type { FormInputWidth, SharedInputProps } from "../../util/form-shared";
import type { IconName } from "../Icon/icon";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { baseInputRecipe } from "./base-input.recipe";

type BaseInputSlots = ReturnType<typeof baseInputRecipe>;

function isIconAdornment(
  val: unknown,
): val is { iconName: IconName; onClick?: () => void } {
  return val != null && typeof val === "object" && "iconName" in val;
}

function isTextAdornment(
  val: unknown,
): val is { text: string; onClick?: () => void } {
  return val != null && typeof val === "object" && "text" in val;
}

function renderAdornment(
  adornment:
    | { iconName: IconName; onClick?: () => void }
    | { text: string; onClick?: () => void }
    | React.ReactNode,
  size: "xs" | "sm" | "md" | "lg",
  classes: BaseInputSlots,
): React.ReactNode {
  if (isIconAdornment(adornment)) {
    const icon = <Icon name={adornment.iconName} size={size} />;
    if (adornment.onClick) {
      return (
        <button
          type="button"
          onClick={adornment.onClick}
          className={classes.adornmentButton}
        >
          {icon}
        </button>
      );
    }
    return <span className={classes.adornment}>{icon}</span>;
  }

  if (isTextAdornment(adornment)) {
    const text = (
      <span className={classes.adornmentText}>{adornment.text}</span>
    );
    if (adornment.onClick) {
      return (
        <button
          type="button"
          onClick={adornment.onClick}
          className={classes.adornmentButton}
        >
          {text}
        </button>
      );
    }
    return <span className={classes.adornment}>{text}</span>;
  }

  return adornment;
}

export const BaseInput = (
  props: {
    /** The html type of the input element (text/number etc) */
    type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
    /** The keyboard that should be used on mobile devices. */
    inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
    /** An optional placeholder for the input */
    placeholder?: string;
    /** Disable editing of the input. Unlike disabled this strips the input styles and displays the value as text */
    readonly?: boolean;
    /** Whether the input is in a loading state */
    loading?: boolean;
    /** subtle inputs have no border and display similarly to inline text */
    variant?: "default" | "subtle";
    /** set the alignment of the text in the input */
    align?: "left" | "center" | "right";
    /** A set of standard widths to choose for the input. You can also set the width with css when aligning with other inputs is not required. */
    width?: FormInputWidth;
    /** Optional element or button to include at the beginning of an input */
    prefix?:
      | { iconName: IconName; onClick?: () => void }
      | { text: string; onClick?: () => void }
      | React.ReactNode;
    /** Optional element or button to include at the end of an input */
    suffix?:
      | { iconName: IconName; onClick?: () => void }
      | { text: string; onClick?: () => void }
      | React.ReactNode;
    /** A customized view that is shown when the input is unfocused. Can be used to present the value with extra formatting */
    styledValue?: React.ReactNode;
    /** Set to allow the input to be cleared. As the component is controlled you must clear the value manually with onClear. */
    clearable?: {
      clearable: boolean;
      onClear: () => void;
    };
    onClick?: React.MouseEventHandler<Element>;
    onKeyDown?: React.KeyboardEventHandler<Element>;
    min?: number;
    max?: number;
    step?: number;
    maxLength?: number;
    pattern?: string;
    spellcheck?: boolean;
    /** Set to prevent browsers from autocompleting input fields */
    autocomplete?: false;
  } & SharedInputProps<
    HTMLInputElement,
    string | null | undefined,
    (
      value: string,
      event: React.InputHTMLAttributes<HTMLInputElement>["onChange"],
    ) => void
  > &
    React.AriaAttributes,
) => {
  const {
    type,
    inputMode,
    placeholder,
    readonly,
    loading,
    variant = "default",
    align = "left",
    width,
    prefix,
    suffix,
    styledValue,
    clearable,
    onClick,
    onKeyDown,
    min,
    max,
    step,
    maxLength,
    pattern,
    spellcheck,
    autocomplete,
    className,
    name,
    value,
    onChange,
    onFocus,
    onBlur,
    size = "md",
    testId,
    ref,
    inputRef,
    disabled,
    required,
    invalid,
    ...ariaProps
  } = props;

  const [focused, setFocused] = useState(false);
  const internalRef = useRef<HTMLInputElement>(null);

  const classes = baseInputRecipe({
    variant,
    size,
    align,
    width,
    invalid: !!invalid,
    disabled: !!disabled,
  });

  const setInputRef = (el: HTMLInputElement | null) => {
    internalRef.current = el;
    if (typeof inputRef === "function") {
      inputRef(el);
    } else if (inputRef) {
      (inputRef as { current: HTMLInputElement | null }).current = el;
    }
  };

  if (readonly) {
    return (
      <span
        ref={ref}
        className={cx(classes.readonly, className)}
        data-testid={testId}
        {...ariaProps}
      >
        {styledValue ?? value ?? ""}
      </span>
    );
  }

  const showClear = !!(clearable?.clearable && value);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click-to-focus container delegates to inner <input>
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cx(classes.root, className)}
      onClick={(event) => {
        if (!disabled) {
          internalRef.current?.focus();
          onClick?.(event);
        }
      }}
      data-testid={testId}
    >
      {prefix != null && renderAdornment(prefix, size, classes)}

      <div className={classes.inputWrapper}>
        <input
          ref={setInputRef}
          type={type}
          inputMode={inputMode}
          name={name}
          value={value ?? ""}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={invalid ?? undefined}
          onChange={(event) => {
            onChange(
              event.target.value,
              event as unknown as React.InputHTMLAttributes<HTMLInputElement>["onChange"],
            );
          }}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onKeyDown={onKeyDown}
          min={min}
          max={max}
          step={step}
          maxLength={maxLength}
          pattern={pattern}
          spellCheck={spellcheck}
          autoComplete={autocomplete === false ? "off" : undefined}
          className={cx(
            classes.input,
            styledValue && !focused ? classes.hiddenInput : undefined,
          )}
          {...ariaProps}
        />

        {styledValue && !focused && (
          <div className={classes.styledValueOverlay}>{styledValue}</div>
        )}
      </div>

      {suffix != null && renderAdornment(suffix, size, classes)}

      {showClear && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            clearable.onClear();
            internalRef.current?.focus();
          }}
          className={classes.adornmentButton}
          aria-label="Clear input"
        >
          <Icon name="close" size={size} />
        </button>
      )}

      {loading && (
        <span className={classes.adornment}>
          <LoadingSpinner size={size} />
        </span>
      )}
    </div>
  );
};
