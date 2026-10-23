import { useRef, useState } from "react";
import { useMergeRefs } from "use-callback-ref";

import { cx } from "@hashintel/ds-helpers/css";

import {
  preventAutocompleteProps,
  resolveAutoFocusProps,
} from "../../util/form-shared";
import { renderAdornment } from "../../util/render-adornment";
import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { baseInputRecipe } from "./base-input.recipe";
import { InputConnector } from "./input-connector";
import { iconSizeMap } from "./text-input-util";

import type {
  FormInputSize,
  FormInputWidth,
  SharedInputProps,
} from "../../util/form-shared";
import type { IconName } from "../Icon/icon";

export type BaseInputProps = {
  /** The HTML `type` of the underlying input element, such as `text` or `number`. */
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"];
  /** The keyboard that should be used on mobile devices. */
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  /** Whether editing is disabled. Unlike `disabled`, strips the input styles and renders the value as plain text. */
  readonly?: boolean;
  /** Whether a loading spinner is shown inside the input. */
  loading?: boolean;
  /** The input's visual style: `subtle` removes the border so it reads as inline text. */
  variant?: "default" | "subtle";
  /** The alignment of the text inside the input. */
  align?: "left" | "center" | "right";
  /** A set of standard width presets, for aligning with other inputs. */
  width?: FormInputWidth;
  /** Element rendered at the start of the input. */
  prefix?: PrefixOrSuffix;
  /** Element rendered at the end of the input. */
  suffix?: PrefixOrSuffix;
  /** Whether this input renders as connected to the input on its left. Set the matching prop on both inputs; `subtle` and `readonly` inputs are never connected. */
  connectToLeftInput?: boolean;
  /** Whether this input renders as connected to the input on its right. Set the matching prop on both inputs; `subtle` and `readonly` inputs are never connected. */
  connectToRightInput?: boolean;
  /** A formatted view of the value, shown while the input is unfocused. */
  styledValue?: React.ReactNode;
  /** Whether the input can be cleared. `true` empties it through the normal change pipeline (`onChange` fires with `""`); pass `{ onClear }` to control clearing yourself; `false` reserves the clear button's space without enabling it. */
  clearable?: boolean | { onClear: () => void };
  showEditIcon?: boolean;
  /** Whether the browser may autocomplete the input. */
  autocomplete?: boolean;
  onClick?: React.MouseEventHandler<Element>;
  onKeyDown?: React.KeyboardEventHandler<Element>;
  /**
   * Extra props merged onto the inner `<input>`, for wiring it into a
   * composite Ark UI widget such as Combobox. Defined entries override the
   * input's own attributes and handlers run before the input's own; `value`
   * and `defaultValue` are ignored, keeping the input controlled.
   */
  inputElementProps?: React.ComponentPropsWithoutRef<"input">;
  min?: number;
  max?: number;
  step?: number | "any";
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  spellcheck?: boolean;
  tabIndex?: number;
  /** Inline style applied to the outer wrapper. Useful for setting CSS variables like `--form-width`. */
  style?: React.CSSProperties;
} & SharedInputProps<
  HTMLInputElement,
  string | null | undefined,
  (value: string, event: React.ChangeEvent<HTMLInputElement>) => void
> &
  React.AriaAttributes;

export type PrefixOrSuffix = (
  | {
      /** Fills the slot with a design-system icon — a slot takes exactly one of `iconName`, `text`, or `content`. */
      iconName: IconName;
      /** Makes the slot a button. */
      onClick?: () => void;
      /** Disables just the slot's button. */
      disabled?: boolean;
    }
  | {
      /** Fills the slot with a short text label, such as a unit or protocol. */
      text: string;
      /** Makes the slot a button. */
      onClick?: () => void;
      /** Disables just the slot's button. */
      disabled?: boolean;
    }
  | {
      /** Fills the slot with arbitrary content. */
      content: React.ReactNode;
    }
) & {
  /** `subtle` blends the slot into the field, with no divider from the input text. */
  variant?: "default" | "subtle";
};

// Docs-only marker: renders nothing, exists so react-docgen can surface the
// `prefix`/`suffix` slot object's props in the docs prop tables.
export const PrefixOrSuffixDoc = (_props: PrefixOrSuffix): null => null;

const loadingSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xs",
  xs: "xs",
  sm: "sm",
  md: "sm",
  lg: "md",
};

export const BaseInput = ({
  type = "text",
  inputMode,
  placeholder,
  readonly,
  loading,
  variant = "default",
  align = "left",
  width = "fullWidth",
  prefix,
  suffix,
  connectToLeftInput,
  connectToRightInput,
  styledValue,
  clearable,
  showEditIcon,
  onClick,
  onKeyDown,
  inputElementProps,
  min,
  max,
  step,
  maxLength,
  minLength,
  pattern,
  spellcheck,
  autocomplete = false,
  className,
  style,
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
}: BaseInputProps) => {
  const [focused, setFocused] = useState(false);
  const internalRef = useRef<HTMLInputElement>(null);
  const mergedInputRef = useMergeRefs([
    internalRef,
    ...(inputRef ? [inputRef] : []),
  ]);
  const fieldIdFromContext = useFieldId();
  const inputId = htmlForId ?? fieldIdFromContext ?? undefined;

  const hasBrowserControls = type === "number";
  const noAutocomplete = !!clearable || !autocomplete;
  const showClear = clearable !== undefined && !disabled;

  const {
    value: _extraValue,
    defaultValue: _extraDefaultValue,
    onChange: extraOnChange,
    onFocus: extraOnFocus,
    onBlur: extraOnBlur,
    onKeyDown: extraOnKeyDown,
    ...extraInputAttrs
  } = inputElementProps ?? {};
  // Undefined entries must not override the input's own attributes when spread
  const definedExtraInputAttrs = Object.fromEntries(
    Object.entries(extraInputAttrs).filter(([, attr]) => attr !== undefined),
  ) as typeof extraInputAttrs;

  // Default clear: empties the input through its own change pipeline (native
  // setter + input event), so `onChange` receives a real ChangeEvent exactly
  // as if the user had emptied the field.
  const clearValue = () => {
    if (typeof clearable === "object") {
      clearable.onClear();
      return;
    }
    const input = internalRef.current;
    if (!input) {
      return;
    }
    Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const hasIcons = !!loading || showClear;
  const connectsLeft = connectToLeftInput && variant === "default";
  const connectsRight = connectToRightInput && variant === "default";
  const subtlePrefix = variant === "default" && prefix?.variant === "subtle";

  const classes = baseInputRecipe({
    variant,
    size,
    align,
    width,
    invalid: !!invalid,
    disabled: !!disabled,
    loading: !!loading,
    hasBrowserControls,
    hasIcons,
    editAndClear: showClear && showEditIcon,
    connectsLeft,
    connectsRight,
    subtlePrefix,
    willClear:
      showClear && !!clearable && (value === null || value === undefined),
  });

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

  const input = (
    <input
      id={inputId}
      ref={mergedInputRef}
      type={type}
      inputMode={inputMode}
      name={name}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      aria-invalid={invalid ?? undefined}
      onChange={(event) => {
        extraOnChange?.(event);
        onChange(event.target.value, event);
      }}
      onFocus={(event) => {
        extraOnFocus?.(event);
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        extraOnBlur?.(event);
        setFocused(false);
        onBlur?.(event);
      }}
      onKeyDown={
        extraOnKeyDown
          ? (event) => {
              extraOnKeyDown(event);
              onKeyDown?.(event);
            }
          : onKeyDown
      }
      min={min}
      max={max}
      step={step}
      maxLength={maxLength}
      minLength={minLength}
      pattern={pattern}
      spellCheck={spellcheck}
      {...(noAutocomplete ? preventAutocompleteProps : {})}
      data-testid={testId}
      className={cx(
        classes.input,
        styledValue && !focused ? classes.hiddenInput : undefined,
      )}
      {...resolveAutoFocusProps(autoFocus)}
      {...ariaProps}
      {...definedExtraInputAttrs}
    />
  );

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cx(classes.wrapper, className)}
      style={style}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click-to-focus container delegates to inner <input> */}
      <div
        className={classes.root}
        onClick={(event) => {
          if (!disabled) {
            internalRef.current?.focus();
            onClick?.(event);
          }
        }}
      >
        {prefix != null && renderAdornment("prefix", prefix, size, classes)}
        {connectToLeftInput && variant === "default" && (
          <InputConnector
            className={cx(
              classes.connector,
              classes.connectLeft,
              prefix && classes.connectAdornment,
            )}
            data-part="connector"
          />
        )}

        <div className={classes.inputWrapper}>
          {input}
          {styledValue && !focused && (
            <div className={classes.styledValueOverlay}>{styledValue}</div>
          )}
          {showClear && (
            <button
              type="button"
              data-part="clear"
              onMouseDown={(event) => {
                // prevents focus from changing/being removed from the input which can lead to UI stutter
                // if selectedDisplay is set
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                clearValue();
                internalRef.current?.focus();
              }}
              className={cx(
                classes.clear,
                (!clearable || !value) && classes.hideClear,
              )}
              aria-label="Clear input"
            >
              <Icon
                name="close"
                size={iconSizeMap[size]}
                className={classes.clearIcon}
              />
            </button>
          )}
          {!disabled && showEditIcon && (
            <span className={classes.editIcon} data-part="edit">
              <Icon name="pencil" size={loadingSizeMap[size]} />
            </span>
          )}
        </div>

        {loading && (
          <span className={classes.loading} data-part="loading">
            <LoadingSpinner size={loadingSizeMap[size]} variant="bars" />
          </span>
        )}

        {suffix != null && renderAdornment("suffix", suffix, size, classes)}
        {connectToRightInput && variant === "default" && (
          <InputConnector
            className={cx(
              classes.connector,
              classes.connectRight,
              suffix && classes.connectAdornment,
            )}
            data-part="connector"
          />
        )}
      </div>
    </div>
  );
};
