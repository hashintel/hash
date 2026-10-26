/**
 * The DS date picker (Figma `datePicker`, key 1056bbf2…, Figma only), composed from DS code parts. With
 * `showRelativeSelection` on it is one surface: a "Relative to today" column on the left, the month on the right
 * (Design System file, DatePicker page, node 21469:22305). `showTimeSingle` adds a time row under the month.
 *
 * MOCK, editor side only: relative dates. The engine stores fixed dates only.
 */
import { useEffect, useRef, useState } from "react";

import {
  Icon,
  NumberInput,
  Popover,
  SegmentedControl,
  Select,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  type IntervalUnit,
  intervalUnits,
  type RelativeDate,
} from "./document";

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

/** "90 days ago"; an interval says its anchor: "90 days before step run", "1 week after flow start". */
export const relativeLabel = (relative: RelativeDate) => {
  if (relative.kind === "daysAgo") {
    return `${relative.days} days ago`;
  }
  if (relative.kind === "interval") {
    const unit =
      relative.amount === 1 ? relative.unit.slice(0, -1) : relative.unit;
    // 26 Oct (Figma 555:16967): "before" / "after" the anchor, not "ago" / "from now", which read as "from today".
    return `${relative.amount} ${unit} ${relative.direction === "ago" ? "before" : "after"} ${relative.anchor === "flowStart" ? "flow start" : "step run"}`;
  }
  return (
    relativePresets.find((preset) => preset.value.kind === relative.kind)
      ?.text ?? ""
  );
};

type Interval = Extract<RelativeDate, { kind: "interval" }>;

const defaultInterval: Interval = {
  kind: "interval",
  amount: 90,
  unit: "days",
  direction: "ago",
  anchor: "stepRun",
};

const anchorText = {
  stepRun: "Step run time",
  flowStart: "Flow start",
} satisfies Record<Interval["anchor"], string>;

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
  flexDirection: "column",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "[10px]",
  boxShadow:
    "[0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)]",
  overflow: "hidden",
});

/** The popover's first focus lands here, not on the first row, so no ring shows at open. */
const focusTargetStyle = css({ "&:focus": { outline: "none" } });

const partsStyle = css({ display: "flex", alignItems: "stretch" });

/** A full-width row under both columns, with a hairline above it. */
const footerRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingX: "[3px]",
  paddingY: "[3px]",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
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

/** How far the panel's right edge is inside the window edge in Figma (J3 · A3: 1436 of 1440). */
const panelInset = 4;

/** The custom popover's top sits this far above the picker's top (Figma 555:15477: y 152 against 272). */
const customPopoverRise = -120;

/** `Custom interval · popover` (Figma 555:16967): one DS popover surface, 296 px, 16 px in, 12 px between the fields. */
const customContentStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "[296px]",
  padding: "4",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "[10px]",
  boxShadow:
    "[0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)]",
});

const customLabelStyle = css({ textStyle: "sm", color: "neutral.fg.subtle" });

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
  /** Opens with the "Custom…" interval popover showing (Figma D2). */
  customOpen?: boolean;
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
  customOpen: initialCustomOpen = false,
}: DatePickerSurfaceProps) => {
  const [daysOpen, setDaysOpen] = useState(relative?.kind === "daysAgo");
  const [customOpen, setCustomOpen] = useState(initialCustomOpen);
  const customRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const interval = relative?.kind === "interval" ? relative : defaultInterval;
  const changeInterval = (change: Partial<Interval>) =>
    onPickRelative?.({ ...interval, ...change });
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
    <div
      ref={surfaceRef}
      className={surfaceStyle}
      role="dialog"
      aria-label={label}
    >
      <div className={partsStyle}>
        {onPickRelative ? (
          <div className={relativeColumnStyle}>
            <div className={relativeLabelStyle}>
              {relative?.kind === "interval" || customOpen
                ? `Relative to ${anchorText[interval.anchor].toLowerCase()}`
                : "Relative to today"}
            </div>
            {relativePresets
              .filter((preset) => !isStartOfPreset(preset))
              .map(presetRow)}
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
            <button
              ref={customRef}
              type="button"
              className={relativeRowStyle}
              aria-pressed={relative?.kind === "interval" || customOpen}
              title="Editor mock: the engine stores fixed dates only."
              onClick={() => {
                setCustomOpen(true);
                if (relative?.kind !== "interval") {
                  onPickRelative(defaultInterval);
                }
              }}
            >
              Custom…
            </button>
            {relativePresets.filter(isStartOfPreset).map(presetRow)}
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
      {footer ? <div className={footerRowStyle}>{footer}</div> : null}
      {customOpen && onPickRelative ? (
        <Popover
          triggerRef={surfaceRef}
          position="left-start"
          positionFromPoint={{ x: 0, y: customPopoverRise }}
          gapX={8}
          gapY={0}
          onClose={() => setCustomOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Custom interval"
            className={customContentStyle}
          >
            <span className={customLabelStyle}>Relative to</span>
            <Select
              size="sm"
              items={Object.entries(anchorText).map(([value, text]) => ({
                value,
                text,
              }))}
              value={interval.anchor}
              aria-label="Relative to"
              onChange={(anchor) =>
                changeInterval({ anchor: anchor as Interval["anchor"] })
              }
            />
            <span className={customLabelStyle}>Amount and unit</span>
            <div className={css({ display: "flex", gap: "2" })}>
              <div className={css({ width: "[70px]", flexShrink: 0 })}>
                <NumberInput
                  size="sm"
                  width="fullWidth"
                  min={1}
                  value={interval.amount}
                  aria-label="Amount"
                  onChange={(amount) =>
                    changeInterval({ amount: Math.max(1, amount ?? 1) })
                  }
                />
              </div>
              <Select
                size="sm"
                width="fullWidth"
                items={intervalUnits.map((unit) => ({
                  value: unit,
                  text: unit,
                }))}
                value={interval.unit}
                aria-label="Unit"
                onChange={(unit) =>
                  changeInterval({ unit: unit as IntervalUnit })
                }
              />
            </div>
            <span className={customLabelStyle}>Before or after</span>
            <div>
              <SegmentedControl<Interval["direction"]>
                size="sm"
                items={[
                  { value: "ago", label: "before" },
                  { value: "fromNow", label: "after" },
                ]}
                value={interval.direction}
                onChange={(direction) => changeInterval({ direction })}
              />
            </div>
          </div>
        </Popover>
      ) : null}
    </div>
  );
};

/**
 * The picker's popover. With `alignToPanel` it sits under its trigger with its right edge on the properties panel's
 * (Figma J3 · A3); the date picker is wider than the panel, so it grows leftward over the canvas edge.
 */
export const DatePopover = ({
  triggerRef,
  alignToPanel = false,
  onClose,
  ...surface
}: DatePickerSurfaceProps & {
  triggerRef: React.RefObject<HTMLElement | null>;
  alignToPanel?: boolean;
  onClose: () => void;
}) => {
  const focusRef = useRef<HTMLDivElement | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    // The trigger may be set by its parent's effect: look once it is in place.
    const frame = requestAnimationFrame(() => {
      const trigger = triggerRef.current;
      const panel = trigger?.closest("aside");
      if (trigger && panel) {
        const rect = trigger.getBoundingClientRect();
        setPoint({
          x: panel.getBoundingClientRect().right - panelInset - rect.left,
          y: rect.height,
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [triggerRef]);
  if (alignToPanel && !point) {
    return null;
  }
  return (
    <Popover
      triggerRef={triggerRef}
      position="bottom-end"
      positionFromPoint={alignToPanel ? (point ?? undefined) : undefined}
      gapX={0}
      gapY={4}
      initialFocusRef={focusRef}
      onClose={onClose}
    >
      <div ref={focusRef} tabIndex={-1} className={focusTargetStyle}>
        <DatePickerSurface {...surface} />
      </div>
    </Popover>
  );
};

export { relativeRowStyle };
