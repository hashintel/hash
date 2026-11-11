import { useId, useRef, useState } from "react";
import { useMergeRefs } from "use-callback-ref";

import { cx } from "@hashintel/ds-helpers/css";

import { OverflowRow } from "../../primitives/OverflowRow/overflow-row";
import {
  preventAutocompleteProps,
  resolveAutoFocusProps,
} from "../../util/form-shared";
import { hasCommandModifier } from "../../util/keyboard";
import { renderAdornment } from "../../util/render-adornment";
import { Chip } from "../Chip/chip";
import { comboboxMultiRecipe } from "../Combobox/combobox.recipe";
import { useFieldId } from "../Form/field-id-context";
import { Icon } from "../Icon/icon";
import { LoadingSpinner } from "../Loading/loading-spinner";
import { baseInputRecipe } from "../TextInput/base-input.recipe";
import { InputConnector } from "../TextInput/input-connector";

import type { FormInputSize } from "../../util/form-shared";
import type { ChipSize } from "../Chip/chip-util";
import type { TextInput } from "../TextInput/text-input";

export type TagsInputProps = Omit<
  React.ComponentProps<typeof TextInput>,
  | "type"
  | "inputMode"
  | "showEditIcon"
  | "autocomplete"
  | "maxLength"
  | "minLength"
  | "pattern"
  | "spellcheck"
  | "value"
  | "onChange"
  | "styledValue"
  | "clearable"
> & {
  /** The input value */
  value: ReadonlyArray<string>;
  /** The onChange handler */
  onChange: (value: string[]) => void;
  /** Whether committing an already-present value adds another occurrence instead of being ignored. */
  allowDuplicates?: boolean;
  /** How the values render in the input when no `renderSelectedAll` is given: a chip row that scrolls horizontally (the default), a chip row that truncates with a "+X" badge, or a plain-text summary of the values (falling back to "X selected" once they no longer fit). */
  overflow?: "scroll" | "truncate" | "summary";
  /** Custom renderer for a selected value, replacing its default chip entirely — remove button included; removal stays available through the keyboard and `clearable`. */
  renderSelectedItem?: (value: string) => React.ReactNode;
  /** Custom renderer for the selected values in the input, replacing the default overflow row */
  renderSelectedAll?: (values: string[]) => React.ReactNode;
  /** Whether the input can be cleared. `true` empties the values and the typed draft (`onChange` fires with `[]`); pass `{ onClear }` to control clearing yourself; `false` reserves the clear button's space without enabling it. */
  clearable?: boolean | { onClear: () => void };
};

const chipSizeMap: Record<FormInputSize, ChipSize> = {
  xxs: "xxs",
  xs: "xs",
  sm: "md",
  md: "lg",
  lg: "xl",
};

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

/**
 * A text input whose committed `value` is a list of strings, each rendered as
 * a removable chip inside the input.
 * */
export const TagsInput = ({
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
  overflow = "scroll",
  renderSelectedItem,
  renderSelectedAll,
  clearable,
  onClick,
  onKeyDown,
  tabIndex,
  className,
  name,
  value,
  onChange,
  allowDuplicates,
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
}: TagsInputProps) => {
  const wrapperRef = useRef<HTMLElement>(null);
  const mergedWrapperRef = useMergeRefs([wrapperRef, ...(ref ? [ref] : [])]);
  const fieldIdFromContext = useFieldId();
  // The input always carries a concrete id: the row's machine registers it,
  // and the frame's click-to-focus looks the element up by it.
  const generatedInputId = useId();
  const inputId =
    htmlForId ?? fieldIdFromContext ?? `tags-input${generatedInputId}`;

  const [draft, setDraft] = useState("");
  const [rowFocused, setRowFocused] = useState(false);
  const backspaceHoldBeganWithTextRef = useRef(false);

  const hasValues = value.length > 0;
  const customSelection =
    renderSelectedAll !== undefined && hasValues
      ? renderSelectedAll([...value])
      : undefined;

  // A submitted draft becomes a new value — unless it is empty or, without
  // `allowDuplicates`, already present (as in the multiple Combobox) — and
  // either way has served its purpose and clears.
  const submitDraft = (text: string) => {
    setDraft("");
    if (text !== "" && (allowDuplicates || !value.includes(text))) {
      onChange([...value, text]);
    }
  };

  // Removal is by occurrence, not value: with `allowDuplicates` the same
  // value can sit at several indexes.
  const removeValueAt = (index: number) => {
    if (index >= value.length) {
      return;
    }
    onChange(value.toSpliced(index, 1));
  };

  const chipsRemovable =
    !readonly && !disabled && (overflow === "scroll" || rowFocused);
  const rowItems =
    renderSelectedAll !== undefined
      ? []
      : value.map((val, index) => ({
          name: val,
          // Identity embeds the occurrence index: duplicates stay distinct in
          // the row machine, and its `onRemove` can name one occurrence.
          id: `${index}:${val}`,
          children: renderSelectedItem ? (
            renderSelectedItem(val)
          ) : (
            <Chip
              size={chipSizeMap[size]}
              removeable={
                chipsRemovable
                  ? {
                      onRemove: () => removeValueAt(index),
                      "aria-label": `Remove ${val}`,
                      tabIndex: -1,
                    }
                  : false
              }
            >
              {val}
            </Chip>
          ),
        }));

  const connectsLeft = !!connectToLeftInput && variant === "default";
  const connectsRight = !!connectToRightInput && variant === "default";
  const multiClasses = comboboxMultiRecipe({
    variant,
    size,
    width,
    invalid: !!invalid,
    disabled: !!disabled,
    loading: !!loading,
    contentInset:
      hasValues && renderSelectedAll === undefined && overflow !== "summary"
        ? "chips"
        : "text",
    connectsLeft,
    connectsRight,
  });

  if (readonly) {
    return (
      <span
        ref={mergedWrapperRef}
        className={cx(multiClasses.readonly, className)}
        data-testid={testId}
        {...ariaProps}
      >
        {customSelection ??
          (overflow === "summary" ? (
            <OverflowRow items={rowItems} separator=", " overflow="summary" />
          ) : (
            <OverflowRow items={rowItems} overflow={overflow} />
          ))}
      </span>
    );
  }

  const showClear = clearable !== undefined && !disabled;
  const hasContentToClear = hasValues || draft !== "";
  const clearAll = () => {
    setDraft("");
    if (typeof clearable === "object") {
      clearable.onClear();
      return;
    }
    onChange([]);
  };

  const focusInput = () => document.getElementById(inputId)?.focus();

  const handleInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    machineKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void,
  ) => {
    // Cmd/Ctrl+Enter is the consumer's (e.g. submitting a surrounding form).
    if (event.key === "Enter" && hasCommandModifier(event)) {
      onKeyDown?.(event);
      return;
    }
    // Escape abandons the typed draft, as it does in a Combobox.
    if (event.key === "Escape") {
      setDraft("");
    }
    // With the chip row replaced by `renderSelectedAll`, the row's machine
    // has no items to remove — Backspace on an empty draft removes the last
    // value here instead (OverflowRow's hold guard, mirrored).
    if (renderSelectedAll !== undefined && event.key === "Backspace") {
      if (!event.repeat) {
        backspaceHoldBeganWithTextRef.current =
          event.currentTarget.value !== "";
      }
      if (
        event.currentTarget.value === "" &&
        hasValues &&
        !(event.repeat && backspaceHoldBeganWithTextRef.current)
      ) {
        onChange(value.slice(0, -1));
      }
    }
    machineKeyDown(event);
    // Enter only commits the draft; un-prevented it would also submit a
    // surrounding form.
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
    }
    onKeyDown?.(event);
  };

  const inputElementProps = {
    id: inputId,
    disabled,
    "aria-invalid": invalid ?? undefined,
    "aria-required": required === true || undefined,
    "data-testid": testId,
    tabIndex,
    ...preventAutocompleteProps,
    ...resolveAutoFocusProps(autoFocus),
    ...ariaProps,
    ref: inputRef,
    onFocus,
    onBlur,
    onKeyDown: handleInputKeyDown,
  };

  const adornmentClasses = baseInputRecipe({ variant, size });

  const rowInput = {
    value: draft,
    onChange: setDraft,
    onSubmit: submitDraft,
    placeholder: hasValues ? undefined : placeholder,
  };
  // Interactions with the field's own frame — the padding, the clear button,
  // a custom selection — must not blur the row's tags machine, or its
  // keyboard chip control would stall until the input re-focuses (the frame's
  // pointer handling keeps DOM focus on the input, so no focus event would
  // revive it). Mirrors the multiple Combobox.
  const handleRowInteractOutside = (event: {
    detail: { originalEvent: Event };
    preventDefault: () => void;
  }) => {
    const target = event.detail.originalEvent.target;
    if (target instanceof Node && wrapperRef.current?.contains(target)) {
      event.preventDefault();
    }
  };
  // The row reports the removed item's identity (`index:value`) — the
  // leading integer names the occurrence.
  const rowKeyboardControl = {
    onRemove: (identity: string) => removeValueAt(parseInt(identity, 10)),
  };

  return (
    <div
      ref={mergedWrapperRef as React.Ref<HTMLDivElement>}
      className={cx(multiClasses.wrapper, className)}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- click-to-focus frame delegates to the row's <input> */}
      <div
        className={multiClasses.frame}
        // A press anywhere on the frame — a chip, the padding — focuses the
        // input, not just a press on the input itself. The exception is a
        // chip's remove button, whose press only removes the value.
        onPointerDown={(event) => {
          if (disabled) {
            return;
          }
          const target = event.target;
          if (
            target instanceof Element &&
            (target.closest("[data-chip-segment='remove']") ||
              target.closest("[data-part='adornment-button']"))
          ) {
            return;
          }
          if (target !== document.getElementById(inputId)) {
            // Keep focus with the input instead of the pressed element
            event.preventDefault();
            focusInput();
          }
        }}
        onClick={(event) => {
          if (disabled) {
            return;
          }
          // Focus happens on pointerdown above
          focusInput();
          onClick?.(event);
        }}
        onFocus={() => setRowFocused(true)}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
            setRowFocused(false);
            setDraft("");
          }
        }}
      >
        {prefix != null &&
          renderAdornment("prefix", prefix, size, adornmentClasses)}
        {connectsLeft && (
          <InputConnector
            className={cx(
              adornmentClasses.connector,
              adornmentClasses.connectLeft,
              prefix != null && adornmentClasses.connectAdornment,
            )}
            data-part="connector"
          />
        )}
        <div className={multiClasses.content}>
          {customSelection !== undefined && (
            <span className={multiClasses.customSelection}>
              {customSelection}
            </span>
          )}
          {overflow === "summary" && renderSelectedAll === undefined ? (
            <OverflowRow
              className={multiClasses.row}
              items={rowItems}
              separator=", "
              overflow="summary"
              align={align}
              withInput={rowInput}
              withKeyboardControl={rowKeyboardControl}
              inputElementProps={inputElementProps}
              onInputInteractOutside={handleRowInteractOutside}
            />
          ) : (
            <OverflowRow
              className={multiClasses.row}
              items={rowItems}
              overflow={renderSelectedAll !== undefined ? "scroll" : overflow}
              align={align}
              withInput={rowInput}
              withKeyboardControl={rowKeyboardControl}
              inputElementProps={inputElementProps}
              onInputInteractOutside={handleRowInteractOutside}
            />
          )}
          {showClear && (
            <button
              type="button"
              data-part="clear"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                clearAll();
                focusInput();
              }}
              data-hidden={!clearable || !hasContentToClear ? "" : undefined}
              className={cx(
                multiClasses.clear,
                (!clearable || !hasContentToClear) && multiClasses.hideClear,
              )}
              aria-label="Clear input"
            >
              <Icon
                name="close"
                size={iconSizeMap[size]}
                className={multiClasses.clearIcon}
              />
            </button>
          )}
        </div>
        {loading && (
          <span className={multiClasses.loading} data-part="loading">
            <LoadingSpinner size={loadingSizeMap[size]} variant="bars" />
          </span>
        )}
        {suffix != null &&
          renderAdornment("suffix", suffix, size, adornmentClasses)}
        {connectsRight && (
          <InputConnector
            className={cx(
              adornmentClasses.connector,
              adornmentClasses.connectRight,
              suffix != null && adornmentClasses.connectAdornment,
            )}
            data-part="connector"
          />
        )}
      </div>
      {/* Native form participation */}
      {(name !== undefined || required === true) && (
        <select
          multiple
          aria-hidden="true"
          tabIndex={-1}
          name={name}
          required={required}
          disabled={disabled}
          value={[...value]}
          onChange={() => {}}
          className={multiClasses.formMirror}
          onFocus={() => {
            // Validation (reportValidity) focuses the invalid control. Hand
            // focus to the real input so the user can act.
            focusInput();
          }}
        >
          {value.map((entry, index) => (
            // eslint-disable-next-line react/no-array-index-key -- with `allowDuplicates` the occurrence index is the identity
            <option key={`${index}:${entry}`} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      )}
    </div>
  );
};

TagsInput.displayName = "TagsInput";
