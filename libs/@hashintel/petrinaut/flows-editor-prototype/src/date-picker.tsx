/**
 * The DS date picker (Figma `datePicker`, key 1056bbf2…, Figma only), composed from DS code parts. With
 * `showRelativeSelection` on it is one surface: a "Relative to today" column on the left, the month on the right
 * (Design System file, DatePicker page, node 21469:22305). `showTimeSingle` adds a time row under the month.
 *
 * MOCK, editor side only: relative dates. The engine stores fixed dates only.
 */
import { useState } from "react";

import { Icon, NumberInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import type { RelativeDate } from "./document";

export const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const shortMonths = months.map((month) => month.slice(0, 3));

const parseIso = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return { year: year!, month: (month ?? 1) - 1, day: day ?? 1 };
};
const toIso = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** "Sep 30, 2026", as the J3 value pill shows a date. */
export const formatDate = (iso: string) => {
  const { year, month, day } = parseIso(iso);
  return `${shortMonths[month]} ${day}, ${year}`;
};

export const relativePresets: { value: RelativeDate; text: string }[] = [
  { value: { kind: "today" }, text: "Today" },
  { value: { kind: "yesterday" }, text: "Yesterday" },
  { value: { kind: "weekAgo" }, text: "One week ago" },
  { value: { kind: "monthAgo" }, text: "One month ago" },
  { value: { kind: "startOfMonth" }, text: "Start of this month" },
  { value: { kind: "startOfLastMonth" }, text: "Start of last month" },
];

/** The picker lists "Number of days ago" between these two groups (Figma 503:5015). */
const isStartOfPreset = (preset: { value: RelativeDate }) =>
  preset.value.kind === "startOfMonth" ||
  preset.value.kind === "startOfLastMonth";

export const relativeLabel = (relative: RelativeDate) =>
  relative.kind === "daysAgo"
    ? `${relative.days} days ago`
    : (relativePresets.find((preset) => preset.value.kind === relative.kind)
        ?.text ?? "");

/** The prototype's "today" (the world's month is October 2026). */
export const today = { year: 2026, month: 9, day: 21 };
const todayIso = toIso(today.year, today.month, today.day);

const navStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[24px]",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.solid",
  borderRadius: "md",
  backgroundColor: "neutral.bgSolid.min",
  color: "neutral.fg.muted",
  cursor: "pointer",
  "&[class] svg": { width: "[12px]", height: "[12px]", "--icon-size": "12px" },
  _hover: { backgroundColor: "neutral.bgSolid.min.hover" },
  // The popover focuses the first arrow on open; its ring shows only for the keyboard.
  "&:focus:not(:focus-visible)": { outline: "none" },
});

/** `_datepicker/yearanddate`: the month and year, 14 px medium with a dotted underline. */
const yearAndDateStyle = css({
  padding: "0.5",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.body",
  textDecorationLine: "underline",
  textDecorationStyle: "dotted",
  textUnderlineOffset: "[3px]",
});

const dayStyle = css({
  position: "relative",
  width: "[32px]",
  height: "[32px]",
  borderRadius: "[10px]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.body",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
  // `_day` state=disabled: days outside the month.
  "&[data-outside]": { color: "neutral.fg.subtle.disabled" },
  // `_day` state=today: blue, with a dot under the number.
  "&[data-today]": {
    color: "blue.fg.link",
    "&::after": {
      content: '""',
      position: "absolute",
      left: "[50%]",
      bottom: "[4px]",
      width: "[3px]",
      height: "[3px]",
      marginLeft: "[-1.5px]",
      borderRadius: "full",
      backgroundColor: "blue.fg.link",
    },
  },
  // `_day` state=selectedSingle.
  "&[aria-pressed=true]": {
    backgroundColor: "neutral.bg.solid",
    color: "neutral.fg.onSolid",
    "&::after": { display: "none" },
  },
});

/** `_month` select=date: Monday first, six weeks. */
export const DateCalendar = ({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (iso: string) => void;
}) => {
  const initial = value ? parseIso(value) : today;
  const [view, setView] = useState({
    year: initial.year,
    month: initial.month,
  });
  const first = new Date(Date.UTC(view.year, view.month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(view.year, view.month, 1 - offset + index));
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth(),
      day: date.getUTCDate(),
    };
  });
  const step = (by: number) =>
    setView((current) => {
      const next = new Date(Date.UTC(current.year, current.month + by, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  return (
    <div
      className={css({ width: "[224px]" })}
      role="group"
      aria-label="Exact date"
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          padding: "0.5",
        })}
      >
        <button
          type="button"
          className={navStyle}
          aria-label="Previous month"
          onClick={() => step(-1)}
        >
          <Icon name="chevronLeft" size="xs" />
        </button>
        <span
          className={css({
            flex: "1",
            display: "flex",
            justifyContent: "center",
            gap: "0.5",
          })}
        >
          <span className={yearAndDateStyle}>{months[view.month]}</span>
          <span className={yearAndDateStyle}>{view.year}</span>
        </span>
        <button
          type="button"
          className={navStyle}
          aria-label="Next month"
          onClick={() => step(1)}
        >
          <Icon name="chevronRight" size="xs" />
        </button>
      </div>
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: "repeat(7, 32px)",
          paddingY: "1",
          borderBottomWidth: "thin",
          borderBottomStyle: "solid",
          borderBottomColor: "neutral.bd.subtle",
        })}
      >
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
          <span
            key={day}
            className={css({
              textAlign: "center",
              textStyle: "xs",
              color: "neutral.fg.subtle",
            })}
          >
            {day}
          </span>
        ))}
      </div>
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: "repeat(7, 32px)",
          rowGap: "[3px]",
          paddingTop: "[3px]",
        })}
      >
        {cells.map((cell) => {
          const iso = toIso(cell.year, cell.month, cell.day);
          return (
            <button
              key={iso}
              type="button"
              aria-label={formatDate(iso)}
              aria-pressed={iso === value}
              data-outside={cell.month !== view.month || undefined}
              data-today={iso === todayIso || undefined}
              onClick={() => onPick(iso)}
              className={dayStyle}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** The DS popover surface: white, a hairline, 10 px corners and the DS lg shadow; its parts sit side by side. */
const surfaceStyle = css({
  display: "flex",
  alignItems: "stretch",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "[10px]",
  boxShadow:
    "[0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)]",
  overflow: "hidden",
});

/** `relativeSelection`: 176 px, a sidebar gradient, a hairline on its right. */
const relativeColumnStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  width: "[176px]",
  flexShrink: 0,
  paddingX: "[3px]",
  paddingY: "1",
  bgGradient: "to-b",
  gradientFrom: "neutral.bgSolid.min",
  gradientTo: "neutral.bgSolid.surface",
  borderRightWidth: "thin",
  borderRightStyle: "solid",
  borderRightColor: "neutral.bd.subtle",
});

const relativeLabelStyle = css({
  paddingLeft: "3",
  paddingY: "1.5",
  textStyle: "xs",
  fontWeight: "medium",
  color: "neutral.fg.muted",
});

/** A ghost DS Button, text only: 25 px, 10 px in, 8 px corners, 14 px medium. */
const relativeRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  width: "[100%]",
  minHeight: "[25px]",
  paddingX: "2.5",
  borderRadius: "lg",
  textAlign: "left",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.body",
  whiteSpace: "nowrap",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
  "&[aria-pressed=true]": { backgroundColor: "neutral.bg.surface.active" },
});

export type DatePickerSurfaceProps = {
  label: string;
  /** The picked fixed date, as `YYYY-MM-DD`. */
  iso: string | null;
  relative?: RelativeDate;
  onPickDate: (iso: string) => void;
  /** Set to show the relative column (`showRelativeSelection`). */
  onPickRelative?: (relative: RelativeDate) => void;
  /** `showTimeSingle`: a row under the month. */
  time?: React.ReactNode;
  /** A last row under the relative choices, e.g. "Clear". */
  footer?: React.ReactNode;
};

/** One surface, anchored under the value it sets: relative choices on the left (optional), the month on the right. */
export const DatePickerSurface = ({
  label,
  iso,
  relative,
  onPickDate,
  onPickRelative,
  time,
  footer,
}: DatePickerSurfaceProps) => {
  const [daysOpen, setDaysOpen] = useState(relative?.kind === "daysAgo");
  const presetRow = (preset: (typeof relativePresets)[number]) => (
    <button
      key={preset.value.kind}
      type="button"
      className={relativeRowStyle}
      aria-pressed={relative?.kind === preset.value.kind}
      title="Editor mock: the engine stores fixed dates only."
      onClick={() => onPickRelative?.(preset.value)}
    >
      {preset.text}
    </button>
  );
  return (
    <div className={surfaceStyle} role="dialog" aria-label={label}>
      {onPickRelative ? (
        <div className={relativeColumnStyle}>
          <div className={relativeLabelStyle}>Relative to today</div>
          {relativePresets.filter((preset) => !isStartOfPreset(preset)).map(presetRow)}
          {daysOpen ? (
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "2",
                paddingX: "2.5",
                minHeight: "[28px]",
              })}
            >
              <div className={css({ width: "[64px]" })}>
                <NumberInput
                  size="sm"
                  width="fullWidth"
                  min={1}
                  value={relative?.kind === "daysAgo" ? relative.days : 3}
                  aria-label="Number of days ago"
                  onChange={(days) =>
                    onPickRelative({
                      kind: "daysAgo",
                      days: Math.max(1, days ?? 1),
                    })
                  }
                />
              </div>
              <span
                className={css({
                  textStyle: "sm",
                  fontWeight: "medium",
                  color: "neutral.fg.body",
                })}
              >
                days ago
              </span>
            </div>
          ) : (
            <button
              type="button"
              className={relativeRowStyle}
              title="Editor mock: the engine stores fixed dates only."
              onClick={() => {
                setDaysOpen(true);
                onPickRelative({ kind: "daysAgo", days: 3 });
              }}
            >
              Number of days ago
            </button>
          )}
          {relativePresets.filter(isStartOfPreset).map(presetRow)}
          {footer ? (
            <div className={css({ marginTop: "auto" })}>{footer}</div>
          ) : null}
        </div>
      ) : null}
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          paddingX: "1",
          paddingTop: "1",
          paddingBottom: "2",
        })}
      >
        <DateCalendar value={relative ? null : iso} onPick={onPickDate} />
        {time}
      </div>
    </div>
  );
};

export { relativeRowStyle };
