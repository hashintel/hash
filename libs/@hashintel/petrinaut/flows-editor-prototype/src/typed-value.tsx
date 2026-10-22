/**
 * Field kinds v2 (ops `projects/flows-editor/field-kinds.md`): one control per data type, all at the DS `sm` size
 * (28 px). The data type picks the control, never the block:
 *
 * - F2 typed values: a number field; an email or web address typed and checked on blur.
 * - F3 dates: a date picker (no typing), with relative dates where the field allows them (an editor mock), and a
 *   time for date and time.
 * - F4 durations: a number with a unit select joined to it (the spec's proposed `input_withAction`).
 * - F5 options: a toggle for yes or no, a select for a list of choices.
 * - F6 graph picks: a searchable select (the code DS's combobox).
 *
 * Free text with `@` chips is only for human text, in `fields.tsx` (`MentionField`).
 */
import { useRef, useState } from "react";

import {
  Icon,
  NumberInput,
  Popover,
  Select,
  TextInput,
  Toggle,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  DatePickerSurface,
  formatDate,
  relativeLabel,
  relativeRowStyle,
} from "./date-picker";
import { mockEntities, mockEntityTypes } from "./mock-graph";
import { selectTriggerStyle } from "./ui";

import type { InputFormat } from "./catalog";
import type { RelativeDate } from "./document";

export type DurationUnit = "seconds" | "minutes" | "hours" | "days" | "weeks";

/** The engine's `Duration` payload. */
export type DurationValue = { amount: number; unit: DurationUnit };

/** MOCK, editor side: a date relative to the run. The engine stores fixed dates only. */
export type RelativeDateValue = { relative: RelativeDate };

/** The payload kinds that have a control of their own. Any other kind is picked from earlier steps only. */
export const typedKinds = [
  "Text",
  "Number",
  "Boolean",
  "Date",
  "DateTime",
  "Duration",
  "EntityId",
  "VersionedUrl",
  "ActorType",
] as const;

export const isTypedKind = (kind: string | undefined) =>
  !!kind && (typedKinds as readonly string[]).includes(kind);

export const isEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const isWebAddress = (value: string) =>
  /^(https?:\/\/)?[^\s./]+(\.[^\s./]+)+(\/\S*)?$/.test(value.trim());

/** One line under a field saying what is wrong (the DS `FieldPrompt` error variant is Figma only). */
export const errorTextStyle = css({ textStyle: "xs", color: "red.fg.muted" });

const fieldColumnStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[0]",
});

/* ----------------------------------------------------------------------------------------------------------------
 * F3: date, and date and time
 * ------------------------------------------------------------------------------------------------------------- */

const timeSlots = Array.from({ length: 48 }, (_, index) => {
  const time = `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`;
  return { value: time, text: time };
});

/**
 * A time of day (the schedule's "At"): the DS searchable Select over half-hour slots with a clock prefix, as the
 * `datePicker` showTimeSingle row picks a time. Never the browser's native time box.
 */
export const TimeField = ({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) => (
  <Select
    size="sm"
    searchable
    prefix={{ iconName: "clock" }}
    items={
      timeSlots.some((slot) => slot.value === value)
        ? timeSlots
        : [{ value, text: value }, ...timeSlots]
    }
    value={value}
    aria-label={label}
    onChange={(next) => onChange(next ?? value)}
  />
);

const isRelative = (value: unknown): value is RelativeDateValue =>
  typeof value === "object" && value !== null && "relative" in value;

/** A date as the field shows it: "Oct 27, 2026", "Oct 27, 2026, 09:00", or a relative date's name. */
export const describeDateValue = (value: unknown, withTime = false) => {
  if (isRelative(value)) {
    return relativeLabel(value.relative);
  }
  if (typeof value !== "string" || value === "") {
    return null;
  }
  const date = formatDate(value.slice(0, 10));
  return withTime ? `${date}, ${value.slice(11, 16) || "00:00"}` : date;
};

/** The DS Select Trigger at `sm`, with a calendar icon: it opens the picker, it is never typed in. */
const pickerTriggerStyle = cx(
  selectTriggerStyle,
  css({ "& > svg:first-child": { color: "neutral.fg.subtle" } }),
);

const DateField = ({
  value,
  onChange,
  withTime = false,
  allowRelative = false,
  label,
}: {
  value: unknown;
  onChange: (value: string | RelativeDateValue | null) => void;
  withTime?: boolean;
  allowRelative?: boolean;
  label: string;
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const iso =
    typeof value === "string" && value !== "" ? value.slice(0, 10) : null;
  const time =
    withTime && typeof value === "string" && value.length >= 16
      ? value.slice(11, 16)
      : "09:00";
  const shown = describeDateValue(value, withTime);
  const relative = isRelative(value) ? value.relative : undefined;

  const pickDate = (date: string) => {
    onChange(withTime ? `${date}T${time}:00Z` : date);
    if (!withTime) {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={pickerTriggerStyle}
        data-placeholder={!shown || undefined}
        data-open={open || undefined}
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        <Icon name="calendar" size="sm" />
        <span>
          {shown ?? (withTime ? "Select date and time…" : "Select date…")}
        </span>
        <Icon name="chevronDown" size="sm" />
      </button>
      {open ? (
        <Popover
          triggerRef={triggerRef}
          position="bottom-end"
          gapY={4}
          onClose={() => setOpen(false)}
        >
          <DatePickerSurface
            label={`Choose ${label}`}
            iso={iso}
            relative={relative}
            onPickDate={pickDate}
            onPickRelative={
              allowRelative
                ? (next) => {
                    onChange({ relative: next });
                    if (next.kind !== "daysAgo" && next.kind !== "interval") {
                      setOpen(false);
                    }
                  }
                : undefined
            }
            footer={
              shown ? (
                <button
                  type="button"
                  className={relativeRowStyle}
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Clear
                </button>
              ) : null
            }
            time={
              withTime ? (
                // `showTimeSingle`: one time under the month.
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "2",
                    marginTop: "2",
                    paddingTop: "2",
                    paddingX: "1",
                    borderTopWidth: "thin",
                    borderTopStyle: "solid",
                    borderTopColor: "neutral.bd.subtle",
                  })}
                >
                  <span
                    className={css({
                      flex: "1",
                      textStyle: "sm",
                      fontWeight: "medium",
                      color: "neutral.fg.muted",
                    })}
                  >
                    Time
                  </span>
                  <div className={css({ width: "[104px]" })}>
                    <Select
                      size="sm"
                      searchable
                      items={timeSlots}
                      value={time}
                      aria-label={`${label} time`}
                      onChange={(next) =>
                        onChange(
                          `${iso ?? "2026-10-21"}T${next ?? "09:00"}:00Z`,
                        )
                      }
                    />
                  </div>
                </div>
              ) : null
            }
          />
        </Popover>
      ) : null}
    </>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * F4: duration
 * ------------------------------------------------------------------------------------------------------------- */

const durationUnits: { value: DurationUnit; text: string }[] = [
  { value: "seconds", text: "seconds" },
  { value: "minutes", text: "minutes" },
  { value: "hours", text: "hours" },
  { value: "days", text: "days" },
  { value: "weeks", text: "weeks" },
];

const isDuration = (value: unknown): value is DurationValue =>
  typeof value === "object" &&
  value !== null &&
  "amount" in value &&
  "unit" in value;

export const describeDuration = (value: unknown) =>
  isDuration(value) ? `${value.amount} ${value.unit}` : null;

/** A number and its unit, always together (spec F4): the DS number input with a unit select in its action slot. */
const DurationField = ({
  value,
  onChange,
  label,
}: {
  value: unknown;
  onChange: (value: DurationValue | null) => void;
  label: string;
}) => {
  const current = isDuration(value) ? value : null;
  const [unit, setUnit] = useState<DurationUnit>(current?.unit ?? "hours");
  const shownUnit = current?.unit ?? unit;
  const invalid = current !== null && current.amount <= 0;
  return (
    <div className={fieldColumnStyle}>
      <NumberInput
        size="sm"
        width="fullWidth"
        value={current?.amount ?? null}
        placeholder="0"
        invalid={invalid}
        aria-label={`${label} amount`}
        onChange={(amount) =>
          onChange(amount === null ? null : { amount, unit: shownUnit })
        }
        // The unit sits in the field's action slot, as the spec's `input_withAction` draws it.
        suffix={{
          content: (
            <Select
              size="sm"
              variant="naked"
              // A picked unit is a value, not a placeholder: body text, as in the field beside it.
              className={css({
                "&[class] [data-part=trigger]": { color: "neutral.fg.body" },
              })}
              items={durationUnits}
              value={shownUnit}
              aria-label={`${label} unit`}
              onChange={(next) => {
                const nextUnit = next ?? "hours";
                setUnit(nextUnit);
                if (current) {
                  onChange({ amount: current.amount, unit: nextUnit });
                }
              }}
            />
          ),
        }}
      />
      {invalid ? (
        <span className={errorTextStyle}>Must be more than 0</span>
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * F2: an email or web address, typed and checked
 * ------------------------------------------------------------------------------------------------------------- */

const CheckedText = ({
  value,
  onChange,
  format,
  label,
  placeholder,
}: {
  value: unknown;
  onChange: (value: string | null) => void;
  format: "email" | "url";
  label: string;
  placeholder?: string;
}) => {
  const [checked, setChecked] = useState(false);
  const text = typeof value === "string" ? value : "";
  // A web address shows "https://" in front and is stored with it.
  const shown = format === "url" ? text.replace(/^https?:\/\//, "") : text;
  const valid =
    text === "" || (format === "email" ? isEmail(text) : isWebAddress(text));
  return (
    <div className={fieldColumnStyle}>
      <TextInput
        size="sm"
        value={shown}
        aria-label={label}
        placeholder={
          placeholder ??
          (format === "email" ? "name@example.com" : "example.com/page")
        }
        prefix={
          format === "email"
            ? { iconName: "at", variant: "subtle" }
            : { text: "https://", variant: "subtle" }
        }
        invalid={checked && !valid}
        onBlur={() => setChecked(true)}
        onChange={(next) => {
          setChecked(false);
          const trimmed = next.trim();
          onChange(
            trimmed === ""
              ? null
              : format === "url"
                ? `https://${trimmed.replace(/^https?:\/\//, "")}`
                : trimmed,
          );
        }}
      />
      {checked && !valid ? (
        <span className={errorTextStyle}>
          {format === "email" ? "Not an email address" : "Not a web address"}
        </span>
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The control for a data type
 * ------------------------------------------------------------------------------------------------------------- */

const actorTypes = [
  { value: "user", text: "A person" },
  { value: "machine", text: "A machine" },
];

export type TypedValueProps = {
  /** The engine payload kind. */
  kind: string;
  value: unknown;
  /** `null` clears the value. */
  onChange: (value: unknown) => void;
  /** The field's name, for screen readers. */
  label: string;
  /** What a `Text` value is when it is not human text. */
  format?: InputFormat;
  /** F5: the choices of an option field. */
  options?: { value: string; text: string }[];
  /** Dates may be relative to the run (an editor mock), e.g. a default value or a trigger's fixed value. */
  allowRelative?: boolean;
  /** An entity field picks only entities of this type. */
  entityTypeBaseUrl?: string;
  placeholder?: string;
  /** A number takes the DS's narrowest width, not the whole row. */
  compact?: boolean;
};

export const TypedValue = ({
  kind,
  value,
  onChange,
  label,
  format,
  options,
  allowRelative,
  entityTypeBaseUrl,
  placeholder,
  compact,
}: TypedValueProps) => {
  if (options || kind === "ActorType") {
    const items = options ?? actorTypes;
    return (
      <Select
        size="sm"
        searchable={items.length > 8}
        items={items}
        value={typeof value === "string" ? value : null}
        aria-label={label}
        placeholder={placeholder ?? "Choose…"}
        onChange={(next) => onChange(next)}
      />
    );
  }
  switch (kind) {
    case "Number":
      return (
        <NumberInput
          size="sm"
          width={compact ? "xs" : "fullWidth"}
          value={typeof value === "number" ? value : null}
          aria-label={label}
          placeholder={placeholder ?? "0"}
          onChange={(next) => onChange(next)}
        />
      );
    case "Boolean":
      return (
        <div className={css({ display: "flex", alignItems: "center" })}>
          <Toggle
            size="sm"
            value={value === true}
            aria-label={label}
            onChange={(next) => onChange(next)}
          />
        </div>
      );
    case "Date":
    case "DateTime":
      return (
        <DateField
          value={value}
          withTime={kind === "DateTime"}
          allowRelative={allowRelative && kind === "Date"}
          label={label}
          onChange={onChange}
        />
      );
    case "Duration":
      return <DurationField value={value} label={label} onChange={onChange} />;
    case "EntityId": {
      const type = mockEntityTypes.find(
        (candidate) => candidate.baseUrl === entityTypeBaseUrl,
      );
      return (
        <Select
          size="sm"
          searchable
          items={mockEntities
            .filter(
              (entity) =>
                !entityTypeBaseUrl ||
                entity.entityTypeBaseUrl === entityTypeBaseUrl,
            )
            .map((entity) => ({ value: entity.entityId, text: entity.label }))}
          value={typeof value === "string" ? value : null}
          aria-label={label}
          placeholder={
            placeholder ??
            (type ? `Choose a ${type.title.toLowerCase()}` : "Choose an entity")
          }
          onChange={(next) => onChange(next)}
        />
      );
    }
    case "VersionedUrl":
      return (
        <Select
          size="sm"
          searchable
          items={mockEntityTypes.map((type) => ({
            value: type.entityTypeId,
            text: type.title,
          }))}
          value={typeof value === "string" ? value : null}
          aria-label={label}
          placeholder={placeholder ?? "Choose a type"}
          onChange={(next) => onChange(next)}
        />
      );
    default:
      if (format === "email" || format === "url") {
        return (
          <CheckedText
            value={value}
            format={format}
            label={label}
            placeholder={placeholder}
            onChange={onChange}
          />
        );
      }
      return (
        <TextInput
          size="sm"
          value={typeof value === "string" ? value : ""}
          aria-label={label}
          placeholder={placeholder ?? "Enter text"}
          onChange={(next) => onChange(next === "" ? null : next)}
        />
      );
  }
};

/**
 * A multi select's filled trigger: the first pick's name, then "+N" (Aakarsh, 21 Oct: multi-value fields stay on one
 * line). The DS "truncate" overflow measures too early in a narrow panel and shows only "+N".
 */
export const firstAndMore = (labelOf: (value: string) => string) =>
  function SelectedSummary(values: string[]) {
    const [first, ...rest] = values;
    return first === undefined
      ? null
      : // A name's role ("· quality lead") gives way, so "+N" always shows.
        `${labelOf(first).split(" · ")[0]}${rest.length > 0 ? ` +${rest.length}` : ""}`;
  };
