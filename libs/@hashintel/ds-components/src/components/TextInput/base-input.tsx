import { cx } from "@hashintel/ds-helpers/css";
import { useRef, useState } from "react";
import { useMergeRefs } from "use-callback-ref";

import type {
  FormInputSize,
  FormInputWidth,
  SharedInputProps,
} from "../../util/form-shared";
import type { IconName } from "../Icon/icon";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { baseInputRecipe } from "./base-input.recipe";

export type BaseInputProps = {
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
  prefix?: PrefixOrSuffix;
  /** Optional element or button to include at the end of an input */
  suffix?: PrefixOrSuffix;
  /** A customized view that is shown when the input is unfocused. Can be used to present the value with extra formatting */
  styledValue?: React.ReactNode;
  /** Set to allow the input to be cleared. As the component is controlled you must clear the value manually with onClear. */
  clearable?: {
    clearable: boolean;
    onClear: () => void;
  };
  showEditIcon?: boolean;
  /** Set to false to prevent browsers from autocompleting input fields */
  autocomplete?: false;
  onClick?: React.MouseEventHandler<Element>;
  onKeyDown?: React.KeyboardEventHandler<Element>;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  pattern?: string;
  spellcheck?: boolean;
  tabIndex?: number;
} & SharedInputProps<
  HTMLInputElement,
  string | null | undefined,
  (value: string, event: React.ChangeEvent<HTMLInputElement>) => void
> &
  React.AriaAttributes;

type BaseInputSlots = ReturnType<typeof baseInputRecipe>;
type PrefixOrSuffix =
  | { iconName: IconName; onClick?: () => void; disabled?: boolean }
  | { text: string; onClick?: () => void; disabled?: boolean }
  | { type: "text" | "interactive"; content: React.ReactNode };

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

const iconSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xs",
  xs: "xs",
  sm: "sm",
  md: "md",
  lg: "md",
};

const loadingSizeMap: Record<FormInputSize, FormInputSize> = {
  xxs: "xs",
  xs: "xs",
  sm: "sm",
  md: "sm",
  lg: "md",
};

function renderAdornment(
  type: "prefix" | "suffix",
  adornment: PrefixOrSuffix,
  size: FormInputSize,
  classes: BaseInputSlots,
): React.ReactNode {
  const content = isIconAdornment(adornment) ? (
    <Icon name={adornment.iconName} size={iconSizeMap[size]} />
  ) : isTextAdornment(adornment) ? (
    adornment.text
  ) : (
    adornment.content
  );
  if (!("content" in adornment) && adornment.onClick) {
    return (
      <button
        type="button"
        onClick={adornment.onClick}
        disabled={adornment.disabled}
        data-part="adornment-button"
        className={cx(
          classes[type],
          classes.adornment,
          classes.adornmentButton,
          adornment.disabled && classes.disabledButton,
        )}
      >
        {content}
      </button>
    );
  }
  const isInteractive =
    "content" in adornment && adornment.type === "interactive";
  return (
    <span
      className={cx(
        classes[type],
        classes.adornment,
        classes.adornmentText,
        isInteractive && classes.adornmentInteractive,
      )}
      data-part="adornment-text"
      data-interactive={isInteractive || undefined}
    >
      {content}
    </span>
  );
}

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
  styledValue,
  clearable,
  showEditIcon,
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
  autoFocus,
  ...ariaProps
}: BaseInputProps) => {
  const [focused, setFocused] = useState(false);
  const internalRef = useRef<HTMLInputElement>(null);
  const mergedInputRef = useMergeRefs([
    internalRef,
    ...(inputRef ? [inputRef] : []),
  ]);

  const hasBrowserControls = type === "number";
  const noAutocomplete = !!clearable || autocomplete === false;
  const showClear = !!(clearable && !disabled);

  const classes = baseInputRecipe({
    variant,
    size,
    align,
    width,
    invalid: !!invalid,
    disabled: !!disabled,
    loading: !!loading,
    hasBrowserControls,
    willClear:
      showClear &&
      clearable.clearable &&
      (value === null || value === undefined),
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
        onChange(event.target.value, event);
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
      // there is no standard for turning off autocomplete, so we need to include all the
      // following properties to turn off autocomplete for most popular browsers + password managers
      autoComplete={noAutocomplete ? "off" : undefined}
      data-1p-ignore={noAutocomplete ? true : undefined}
      data-lpignore={noAutocomplete ? "true" : undefined}
      data-protonpass-ignore={noAutocomplete ? "true" : undefined}
      data-bwignore={noAutocomplete ? "1" : undefined}
      data-testid={testId}
      className={cx(
        classes.input,
        styledValue && !focused ? classes.hiddenInput : undefined,
      )}
      autoFocus={autoFocus === true ? true : undefined}
      data-no-autofocus={autoFocus === "never" ? true : undefined}
      {...ariaProps}
    />
  );

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
    >
      {prefix != null && renderAdornment("prefix", prefix, size, classes)}

      <div className={classes.inputWrapper}>
        {width === "fitContent" && (
          <span aria-hidden="true" className={classes.sizer}>
            {value !== null && value !== undefined && value.length > 0
              ? value
              : (placeholder ?? "")}
          </span>
        )}
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
              clearable.onClear();
              internalRef.current?.focus();
            }}
            className={cx(
              classes.clear,
              (!clearable.clearable || !value) && classes.hideClear,
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
    </div>
  );
};
