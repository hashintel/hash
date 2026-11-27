import { useState } from "react";

import { NumberInput, Select, TextInput } from "@hashintel/ds-components";

import { isValueOfKind } from "../shared/condition-properties";

import type { PropertyValueKind } from "../shared/condition-properties";
import type { RowValue } from "./property-form";

/** What's wrong with what's typed when it isn't a value of the kind yet. */
const typedErrors: Record<PropertyValueKind["kind"], string> = {
  Text: "Enter a value",
  Number: "Enter a number",
  Boolean: "Choose true or false",
  Date: "Enter a date",
  DateTime: "Enter a date and time",
};

/* The graph's date-time format needs seconds, which `parseDateTime` doesn't. */
const hasSeconds = (text: string) => /T\d{2}:\d{2}:\d{2}/.test(text);

/**
 * A property's value, typed or picked. Commits only a valid value; until then, `onError` reports what's wrong. Its
 * clear button gives the value up rather than emptying it.
 */
export const PropertyValueInput = ({
  valueKind,
  value,
  label,
  autoFocus,
  invalid,
  onCommit,
  onError,
  onClear,
  onLeaveEmpty,
}: {
  valueKind: PropertyValueKind;
  /** `undefined` for a row that has no value yet. */
  value: RowValue | undefined;
  label: string;
  autoFocus: boolean;
  invalid: boolean;
  onCommit: (value: RowValue) => void;
  onError: (error: string | undefined) => void;
  onClear: () => void;
  /** Called when the input is left with no value and nothing typed. */
  onLeaveEmpty: () => void;
}) => {
  /* What's typed, while it differs from the saved value. */
  const [draft, setDraft] = useState<string>();

  const options =
    valueKind.kind === "Boolean"
      ? ["true", "false"]
      : valueKind.kind === "Text"
        ? valueKind.options
        : undefined;

  if (options) {
    const items = options.map((option) => ({ value: option, text: option }));

    return (
      <Select<string>
        items={items}
        value={value === undefined ? null : String(value)}
        placeholder="Choose…"
        invalid={invalid}
        defaultOpen={autoFocus}
        aria-label={label}
        onOpenChange={(open) => {
          if (!open && value === undefined) {
            onLeaveEmpty();
          }
        }}
        onChange={(picked) => {
          if (picked === null) {
            onClear();
          } else {
            onCommit(valueKind.kind === "Boolean" ? picked === "true" : picked);
          }
        }}
      />
    );
  }

  const fieldProps = {
    invalid,
    autoFocus,
    "aria-label": label,
    clearable: { onClear },
    onBlur: () => {
      if (value === undefined && (draft ?? "") === "") {
        onLeaveEmpty();
      }
    },
  };

  if (valueKind.kind === "Number") {
    return (
      <NumberInput
        width="xs"
        value={typeof value === "number" && draft === undefined ? value : null}
        min={-Number.MAX_VALUE}
        max={Number.MAX_VALUE}
        step="any"
        {...fieldProps}
        onChange={(number) => {
          if (number === null) {
            setDraft("");
            onError(typedErrors.Number);
            return;
          }

          setDraft(undefined);
          onError(undefined);
          onCommit(number);
        }}
      />
    );
  }

  const { kind } = valueKind;

  return (
    <TextInput
      type={kind === "Date" ? "date" : "text"}
      value={draft ?? (value === undefined ? "" : String(value))}
      placeholder={kind === "DateTime" ? "YYYY-MM-DDTHH:mm:ssZ" : undefined}
      {...fieldProps}
      onChange={(text) => {
        /* Empty text isn't a value to set: Update entity removes a property instead. */
        if (
          text === "" ||
          !isValueOfKind(valueKind, text) ||
          (kind === "DateTime" && !hasSeconds(text))
        ) {
          setDraft(text);
          onError(typedErrors[kind]);
          return;
        }

        setDraft(undefined);
        onError(undefined);
        onCommit(text);
      }}
    />
  );
};
