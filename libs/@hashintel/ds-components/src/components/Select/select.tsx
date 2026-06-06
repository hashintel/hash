import { useRef } from "react";
import { useMergeRefs } from "use-callback-ref";

import { cx } from "@hashintel/ds-helpers/css";

import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import {
  SelectableList,
  type Item,
  type ItemOrGroup,
} from "../SelectableList/selectable-list";
import { baseInputRecipe } from "../TextInput/base-input.recipe";
import { InputConnector } from "../TextInput/input-connector";

import type {
  FormInputSize,
  FormInputWidth,
  SharedInputProps,
} from "../../util/form-shared";
import type { IconName } from "../Icon/icon";

export type SelectItem = {
  value: string;
  children: string; // Valid content for `<option>`
  disabled?: boolean;
  selectedStyle?: Item["selectedStyle"];
};

export type SelectProps = {
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
  hideArrow?: boolean;
  /** Optional element or button to include at the beginning of an input */
  prefix?: Prefix;
  /** Show the input as connected to another input. To connect 2 inputs, both connectToLeftInput and connectToRightInput should be enabled on both connected inputs. subtle inputs + readonly inputs will not be connected */
  connectToLeftInput?: boolean;
  /** Show the input as connected to another input. To connect 2 inputs, both connectToLeftInput and connectToRightInput should be enabled on both connected inputs. subtle inputs + readonly inputs will not be connected */
  connectToRightInput?: boolean;
  /** Set to allow the input to be cleared. As the component is controlled you must clear the value manually with onClear. */
  clearable?: {
    clearable: boolean;
    onClear: () => void;
  };
  /** Defaults to false, set to true to allow browsers to autocomplete an input */
  onClick?: React.MouseEventHandler<Element>;
  onKeyDown?: React.KeyboardEventHandler<Element>;
  tabIndex?: number;
  items: Array<ItemOrGroup<SelectItem>>;
} & SharedInputProps<
  HTMLSelectElement,
  string | null | undefined,
  (value: string, event: React.ChangeEvent<HTMLSelectElement>) => void
> &
  React.AriaAttributes;

type BaseInputSlots = ReturnType<typeof baseInputRecipe>;
type Prefix =
  | { iconName: IconName }
  | { text: string }
  | { content: React.ReactNode };

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
  adornment: Prefix,
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
  return (
    <span
      className={cx(classes[type], classes.adornment, classes.adornmentText)}
    >
      {content}
    </span>
  );
}

export const Select = ({
  placeholder,
  readonly,
  loading,
  variant = "default",
  align = "left",
  width = "fullWidth",
  prefix,
  connectToLeftInput,
  connectToRightInput,
  clearable,
  onClick,
  onKeyDown,
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
}: SelectProps) => {
  const internalRef = useRef<HTMLInputElement>(null);
  const mergedInputRef = useMergeRefs([
    internalRef,
    ...(inputRef ? [inputRef] : []),
  ]);
  const fieldIdFromContext = useFieldId();
  const inputId = htmlForId ?? fieldIdFromContext ?? undefined;

  const showClear = !!(clearable && !disabled);
  const hasIcons = !!loading || showClear;
  const connectsLeft = connectToLeftInput && variant === "default";
  const connectsRight = connectToRightInput && variant === "default";

  const classes = baseInputRecipe({
    variant,
    size,
    align,
    width,
    invalid: !!invalid,
    disabled: !!disabled,
    loading: !!loading,
    hasIcons,
    connectsLeft,
    connectsRight,
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
        {value ?? ""}
      </span>
    );
  }

  const select = <div id={inputId} ref={mergedInputRef} />;

  return (
    <div ref={ref as React.Ref<HTMLDivElement>} className={classes.wrapper}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click-to-focus container delegates to inner <select> */}
      <div
        className={cx(classes.root, className)}
        onClick={(event) => {
          if (!disabled) {
            internalRef.current?.focus();
            onClick?.(event);
          }
        }}
      >
        {prefix != null && renderAdornment(prefix, size, classes)}
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
          {select}
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
        </div>

        {loading && (
          <span className={classes.loading} data-part="loading">
            <LoadingSpinner size={loadingSizeMap[size]} variant="bars" />
          </span>
        )}

        {connectToRightInput && variant === "default" && (
          <InputConnector
            className={cx(classes.connector, classes.connectRight)}
            data-part="connector"
          />
        )}
      </div>
    </div>
  );
};
