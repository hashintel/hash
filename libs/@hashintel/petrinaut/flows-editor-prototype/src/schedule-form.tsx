/**
 * The schedule form after Google Calendar's Repeat menu and Custom dialog (Dora, 2 Nov sync L152; study
 * `ops/projects/flows-editor/review/gcal-recurrence-study-2026-11-10.md` §6). URL only:
 * - `?triggeradd=g1`: everything inline. Custom… opens its rows under Repeat, and Ends is always in the form.
 * - `?triggeradd=g2`: Google's way. Custom… opens a popover with Repeat every, On and Ends, then Done; the quick
 *   choices never end.
 * - `&schedshow=repeat | custom | saved` lands with the Repeat list open, Custom open (every 2 weeks on Tue and Thu,
 *   after 10 runs) or the new schedule saved in its group. `&schedstart=YYYY-MM-DD` sets the start date.
 *
 * Every Repeat choice reads as the saved row does ("Every weekday", "2nd Tuesday of every month"), so the menu and
 * the Triggers panel row say the same thing. No sub-daily choice: that is a team decision.
 *
 * MOCK: nothing is scheduled. Ends and the start date have no engine field today (Temporal `endAt`,
 * `remainingActions`, `startAt` are not passed).
 */
import { useRef, useState } from "react";

import {
  Button,
  ButtonGroup,
  NumberInput,
  Popover,
  SegmentedControl,
  Select,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { DatePopover } from "./date-picker";

export type ScheduleFormTake = "g1" | "g2";

export const scheduleFormTake = (): ScheduleFormTake | null => {
  const value = new URLSearchParams(globalThis.location.search).get(
    "triggeradd",
  );
  return value === "g1" || value === "g2" ? value : null;
};

export const scheduleShow = (): "repeat" | "custom" | "saved" | null => {
  const value = new URLSearchParams(globalThis.location.search).get(
    "schedshow",
  );
  return value === "repeat" || value === "custom" || value === "saved"
    ? value
    : null;
};

/* ----------------------------------------------------------------------------------------------------------------
 * The rule
 * ------------------------------------------------------------------------------------------------------------- */

type Unit = "day" | "week" | "month" | "year";
type Monthly = "date" | "nth" | "last";
type Ends = "never" | "on" | "after";

export type Rule = {
  once: boolean;
  every: number;
  unit: Unit;
  /** Weekdays, 0 Monday … 6 Sunday. */
  days: number[];
  monthly: Monthly;
  ends: Ends;
  endIso: string;
  count: number;
};

const dayNames = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const dayShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dayLetter = ["M", "T", "W", "T", "F", "S", "S"];
const monthShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
};
const isoOf = (date: Date) => date.toISOString().slice(0, 10);
/** 0 Monday … 6 Sunday. */
const weekday = (date: Date) => (date.getUTCDay() + 6) % 7;
const daysIn = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
const nthOf = (date: Date) => Math.ceil(date.getUTCDate() / 7);
const isLastWeek = (date: Date) => date.getUTCDate() + 7 > daysIn(date);

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
};

const listOf = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;

/** "10 Nov", "1 Jan 2027" (the year only when it isn't the start's). */
const shortDate = (date: Date, year?: number) =>
  `${date.getUTCDate()} ${monthShort[date.getUTCMonth()]}${
    year !== undefined && date.getUTCFullYear() !== year
      ? ` ${date.getUTCFullYear()}`
      : ""
  }`;

const weekdays = [0, 1, 2, 3, 4];

/** The rule's words, as the Triggers panel row reads, without the time. */
export const ruleWords = (rule: Rule, startIso: string) => {
  const start = parse(startIso);
  const n = rule.every;
  if (rule.once) {
    return `Once on ${shortDate(start)}`;
  }
  switch (rule.unit) {
    case "day":
      return n === 1 ? "Every day" : `Every ${n} days`;
    case "week": {
      const days = [...rule.days].sort();
      const isWeekdays =
        days.length === 5 && days.every((day, index) => day === weekdays[index]);
      if (n === 1 && isWeekdays) {
        return "Every weekday";
      }
      if (n === 1) {
        return days.length === 1
          ? `Every ${dayNames[days[0]!]}`
          : `Every ${listOf(days.map((day) => dayShort[day]!))}`;
      }
      return `Every ${n} weeks on ${listOf(days.map((day) => dayShort[day]!))}`;
    }
    case "month": {
      const what =
        rule.monthly === "date"
          ? ordinal(start.getUTCDate())
          : rule.monthly === "nth"
            ? `${ordinal(nthOf(start))} ${dayNames[weekday(start)]}`
            : `Last ${dayNames[weekday(start)]}`;
      return n === 1 ? `${what} of every month` : `${what} of every ${n} months`;
    }
    case "year":
      return n === 1
        ? `Every year on ${shortDate(start)}`
        : `Every ${n} years on ${shortDate(start)}`;
  }
};

/** The saved row: "{when} at {time}". */
export const ruleSummary = (rule: Rule, startIso: string, at: string) =>
  `${ruleWords(rule, startIso)} at ${at}`;

/** The detail line's end: " · until 1 Jan 2027", " · 10 runs". */
export const endsWords = (rule: Rule, startIso: string) =>
  rule.once || rule.ends === "never"
    ? ""
    : rule.ends === "on"
      ? ` · until ${shortDate(parse(rule.endIso), parse(startIso).getUTCFullYear())}`
      : ` · ${rule.count} runs`;

const matches = (rule: Rule, start: Date, date: Date) => {
  const n = rule.every;
  if (rule.once) {
    return isoOf(date) === isoOf(start);
  }
  switch (rule.unit) {
    case "day":
      return Math.round((date.getTime() - start.getTime()) / 864e5) % n === 0;
    case "week": {
      const monday = (value: Date) => value.getTime() - weekday(value) * 864e5;
      const weeks = Math.round((monday(date) - monday(start)) / (7 * 864e5));
      return weeks % n === 0 && rule.days.includes(weekday(date));
    }
    case "month": {
      const months =
        (date.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        date.getUTCMonth() -
        start.getUTCMonth();
      if (months % n !== 0) {
        return false;
      }
      if (rule.monthly === "date") {
        return date.getUTCDate() === start.getUTCDate();
      }
      if (weekday(date) !== weekday(start)) {
        return false;
      }
      return rule.monthly === "nth"
        ? nthOf(date) === nthOf(start)
        : isLastWeek(date);
    }
    case "year":
      return (
        (date.getUTCFullYear() - start.getUTCFullYear()) % n === 0 &&
        date.getUTCMonth() === start.getUTCMonth() &&
        date.getUTCDate() === start.getUTCDate()
      );
  }
};

/** The next `limit` run dates from the start date, inside the rule's end. */
export const nextRuns = (rule: Rule, startIso: string, limit = 3) => {
  const start = parse(startIso);
  const end = rule.ends === "on" ? parse(rule.endIso).getTime() : Infinity;
  const cap = rule.ends === "after" ? rule.count : Infinity;
  const runs: Date[] = [];
  for (let offset = 0; offset < 3700 && runs.length < Math.min(limit, cap); offset += 1) {
    const date = new Date(start.getTime() + offset * 864e5);
    if (date.getTime() > end) {
      break;
    }
    if (matches(rule, start, date)) {
      runs.push(date);
    }
  }
  return runs;
};

/* ----------------------------------------------------------------------------------------------------------------
 * The quick list
 * ------------------------------------------------------------------------------------------------------------- */

const base = (startIso: string): Rule => ({
  once: false,
  every: 1,
  unit: "week",
  days: [weekday(parse(startIso))],
  monthly: "date",
  ends: "never",
  endIso: isoOf(new Date(parse(startIso).getTime() + 90 * 864e5)),
  count: 10,
});

type Quick = { value: string; rule: Rule };

/** Google's Repeat menu for a start date, in the row's words. "Last …" only in the month's last 7 days. */
const quickChoices = (startIso: string): Quick[] => {
  const start = parse(startIso);
  const plain = base(startIso);
  const choices: Rule[] = [
    { ...plain, once: true },
    { ...plain, unit: "day" },
    { ...plain, days: weekdays },
    plain,
    { ...plain, unit: "month", monthly: "nth" },
    ...(isLastWeek(start)
      ? [{ ...plain, unit: "month" as const, monthly: "last" as const }]
      : []),
    { ...plain, unit: "month", monthly: "date" },
    { ...plain, unit: "year" },
  ];
  return choices.map((rule) => ({ value: ruleWords(rule, startIso), rule }));
};

/** A schedule's starting values: every weekday at 09:00, London, starting Tue 10 Nov 2026 (the mocks' today). */
export const scheduleStart = () => {
  const startIso =
    new URLSearchParams(globalThis.location.search).get("schedstart") ??
    "2026-11-10";
  return { startIso, rule: { ...base(startIso), days: weekdays }, at: "09:00", zone: "Europe/London" };
};

/** Custom's preset under `?schedshow=custom|saved`: every 2 weeks on Tue and Thu, after 10 runs. */
export const customPreset = (startIso: string): Rule => ({
  ...base(startIso),
  every: 2,
  days: [1, 3],
  ends: "after",
  count: 10,
});

/* ----------------------------------------------------------------------------------------------------------------
 * Time zones
 * ------------------------------------------------------------------------------------------------------------- */

const zones: [string, string][] = [
  ["Europe/London", "London"],
  ["Europe/Dublin", "Dublin"],
  ["Europe/Lisbon", "Lisbon"],
  ["Europe/Paris", "Paris"],
  ["Europe/Berlin", "Berlin"],
  ["Europe/Amsterdam", "Amsterdam"],
  ["Europe/Madrid", "Madrid"],
  ["Europe/Stockholm", "Stockholm"],
  ["Europe/Athens", "Athens"],
  ["Europe/Istanbul", "Istanbul"],
  ["Asia/Dubai", "Dubai"],
  ["Asia/Kolkata", "Mumbai"],
  ["Asia/Singapore", "Singapore"],
  ["Asia/Tokyo", "Tokyo"],
  ["Australia/Sydney", "Sydney"],
  ["America/New_York", "New York"],
  ["America/Chicago", "Chicago"],
  ["America/Denver", "Denver"],
  ["America/Los_Angeles", "Los Angeles"],
  ["America/Sao_Paulo", "São Paulo"],
  ["UTC", "UTC"],
];

/** "GMT+1" on the start date, from the browser's zone data, so it is right on either side of a clock change. */
const offsetOn = (zone: string, startIso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${startIso}T12:00:00Z`))
    .find((part) => part.type === "timeZoneName")
    ?.value.replace(/^GMT\+0$/, "GMT") ?? "";

export const zoneName = (zone: string) =>
  zones.find(([id]) => id === zone)?.[1] ?? zone;

const zoneItems = (startIso: string) =>
  zones.map(([id, city]) => ({
    value: id,
    text: id === "UTC" ? "UTC" : `${city} · ${offsetOn(id, startIso)}`,
  }));

const times = Array.from({ length: 96 }, (_, index) => {
  const hours = String(Math.floor(index / 4)).padStart(2, "0");
  return `${hours}:${String((index % 4) * 15).padStart(2, "0")}`;
});

/* ----------------------------------------------------------------------------------------------------------------
 * The fields
 * ------------------------------------------------------------------------------------------------------------- */

const mutedLine = css({
  textStyle: "sm",
  color: "neutral.fg.subtle",
  minHeight: "[32px]",
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  columnGap: "2",
});

const rowStyle = css({ display: "flex", alignItems: "center", gap: "2" });

/** Two or three digits, centred. */
const numberStyle = css({ width: "[52px]", flexShrink: 0, "& input": { textAlign: "center" } });

const customPanel = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  padding: "4",
  width: "[440px]",
  // The page's confirm popover surface (triggers-page `confirmStyle`).
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  boxShadow: "md",
  "& .label": { textStyle: "sm", color: "neutral.fg.subtle" },
  "& .grid": {
    display: "grid",
    gridTemplateColumns: "[96px minmax(0, 1fr)]",
    columnGap: "3",
    rowGap: "2",
    alignItems: "center",
  },
});

const unitItems = (n: number) =>
  (["day", "week", "month", "year"] as const).map((unit) => ({
    value: unit,
    text: n === 1 ? unit : `${unit}s`,
  }));

const DateButton = ({
  label,
  iso,
  onPick,
}: {
  label: string;
  iso: string;
  onPick: (iso: string) => void;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const date = parse(iso);
  return (
    <>
      <Button
        ref={ref}
        size="sm"
        variant="subtle"
        tone="neutral"
        aria-label={label}
        iconName="calendar"
        iconPosition="left"
        onClick={() => setOpen((current) => !current)}
      >
        {`${dayShort[weekday(date)]} ${date.getUTCDate()} ${monthShort[date.getUTCMonth()]} ${date.getUTCFullYear()}`}
      </Button>
      {open ? (
        <DatePopover
          triggerRef={ref}
          label={label}
          iso={iso}
          onPickDate={(value) => {
            onPick(value);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
};

/** Repeat every, On (weeks or months) and, with `withEnds`, Ends: the Custom… fields. */
const CustomFields = ({
  rule,
  startIso,
  onChange,
  withEnds,
}: {
  rule: Rule;
  startIso: string;
  onChange: (rule: Rule) => void;
  withEnds: boolean;
}) => {
  const start = parse(startIso);
  const monthItems = [
    { value: "date", text: `On the ${ordinal(start.getUTCDate())}` },
    {
      value: "nth",
      text: `On the ${ordinal(nthOf(start))} ${dayNames[weekday(start)]}`,
    },
    ...(isLastWeek(start)
      ? [{ value: "last", text: `On the last ${dayNames[weekday(start)]}` }]
      : []),
  ];
  return (
    <>
      <span className="label">Repeat every</span>
      <span className={rowStyle}>
        <NumberInput
          size="sm"
          aria-label="Repeat every"
          value={rule.every}
          min={1}
          max={99}
          hideStepper
          className={numberStyle}
          onChange={(value) => onChange({ ...rule, every: value ?? 1 })}
        />
        <Select
          required
          size="sm"
          aria-label="Unit"
          items={unitItems(rule.every)}
          value={rule.unit}
          onChange={(value) =>
            onChange({ ...rule, unit: (value ?? rule.unit) as Unit })
          }
        />
      </span>
      {rule.unit === "week" ? (
        <>
          <span className="label">On</span>
          <ButtonGroup variant="segmented" spacing="sm" noWrap>
            {dayLetter.map((letter, day) => {
              const on = rule.days.includes(day);
              return (
                <Button
                  // eslint-disable-next-line react/no-array-index-key -- seven fixed weekdays
                  key={day}
                  size="sm"
                  variant={on ? "solid" : "subtle"}
                  tone="neutral"
                  aria-label={dayNames[day]}
                  aria-pressed={on}
                  data-weekday={day}
                  onClick={() =>
                    onChange({
                      ...rule,
                      days: on
                        ? rule.days.length > 1
                          ? rule.days.filter((other) => other !== day)
                          : rule.days
                        : [...rule.days, day].sort(),
                    })
                  }
                >
                  {letter}
                </Button>
              );
            })}
          </ButtonGroup>
        </>
      ) : null}
      {rule.unit === "month" ? (
        <>
          <span className="label">On</span>
          <Select
            required
            size="sm"
            aria-label="Day of the month"
            items={monthItems}
            value={rule.monthly}
            onChange={(value) =>
              onChange({ ...rule, monthly: (value ?? rule.monthly) as Monthly })
            }
          />
        </>
      ) : null}
      {withEnds ? <EndsFields rule={rule} startIso={startIso} onChange={onChange} /> : null}
    </>
  );
};

const EndsFields = ({
  rule,
  startIso,
  onChange,
}: {
  rule: Rule;
  startIso: string;
  onChange: (rule: Rule) => void;
}) => (
  <>
    <span className="label">Ends</span>
    <span className={rowStyle}>
      <SegmentedControl
        size="sm"
        aria-label="Ends"
        items={[
          { value: "never", label: "Never" },
          { value: "on", label: "On a date" },
          { value: "after", label: "After" },
        ]}
        value={rule.ends}
        onChange={(value) => onChange({ ...rule, ends: value as Ends })}
      />
      {rule.ends === "on" ? (
        <DateButton
          label="Ends on"
          iso={rule.endIso < startIso ? startIso : rule.endIso}
          onPick={(iso) => onChange({ ...rule, endIso: iso })}
        />
      ) : rule.ends === "after" ? (
        <span className={rowStyle}>
          <NumberInput
            size="sm"
            aria-label="Runs"
            value={rule.count}
            min={1}
            max={730}
            hideStepper
            className={numberStyle}
            onChange={(value) => onChange({ ...rule, count: value ?? 1 })}
          />
          <span className={css({ textStyle: "sm", color: "neutral.fg.muted" })}>
            runs
          </span>
        </span>
      ) : null}
    </span>
  </>
);

export type ScheduleValues = {
  startIso: string;
  rule: Rule;
  at: string;
  zone: string;
};

const runWords = (date: Date, at: string) =>
  `${dayShort[weekday(date)]} ${date.getUTCDate()} ${monthShort[date.getUTCMonth()]}, ${at}`;

/**
 * The schedule rows of the form, in its 160 px label grid: Repeat (and Custom…), Starts, At, Time zone, Ends (g1),
 * then the muted Next runs line.
 */
export const ScheduleFields = ({
  take,
  values,
  onChange,
}: {
  take: ScheduleFormTake;
  values: ScheduleValues;
  onChange: (values: ScheduleValues) => void;
}) => {
  const show = scheduleShow();
  const { startIso, rule, at, zone } = values;
  const quick = quickChoices(startIso);
  const current = ruleWords(rule, startIso);
  const quickMatch = quick.find((choice) => choice.value === current);
  // g1: Custom… stays open as rows once picked; g2: it is a popover with Done.
  const [customRows, setCustomRows] = useState(take === "g1" && show === "custom");
  const [popover, setPopover] = useState(take === "g2" && show === "custom");
  const [draft, setDraft] = useState<Rule>(() =>
    take === "g2" && show === "custom" ? customPreset(startIso) : rule,
  );
  const repeatRef = useRef<HTMLSpanElement>(null);
  const items = [
    ...quick.map((choice) => ({ value: choice.value, text: choice.value })),
    // A custom rule shows as its own choice, as Google does.
    ...(quickMatch || (take === "g1" && customRows) ? [] : [{ value: current, text: current }]),
    { value: "custom", text: "Custom…" },
  ];
  const set = (patch: Partial<ScheduleValues>) => onChange({ ...values, ...patch });
  const pick = (value: string | null) => {
    if (value === "custom") {
      if (take === "g1") {
        setCustomRows(true);
      } else {
        setDraft(rule);
        setPopover(true);
      }
      return;
    }
    const choice = quick.find((candidate) => candidate.value === value);
    if (choice) {
      setCustomRows(false);
      set({ rule: { ...choice.rule, ends: rule.ends, endIso: rule.endIso, count: rule.count } });
    }
  };
  const runs = nextRuns(rule, startIso);
  return (
    <>
      <span className="label">Repeat</span>
      <span ref={repeatRef} className={css({ display: "block" })}>
        <Select
          required
          size="sm"
          aria-label="Repeat"
          items={items}
          value={take === "g1" && customRows ? "custom" : current}
          defaultOpen={show === "repeat"}
          onChange={pick}
        />
      </span>
      {take === "g1" && customRows ? (
        <CustomFields
          rule={rule}
          startIso={startIso}
          onChange={(next) => set({ rule: next })}
          withEnds={false}
        />
      ) : null}
      {popover ? (
        <Popover
          triggerRef={repeatRef}
          position="bottom-start"
          gapY={4}
          onClose={() => setPopover(false)}
        >
          <div className={customPanel} data-custom-repeat>
            <span className={css({ textStyle: "sm", fontWeight: "medium", color: "neutral.fg.heading" })}>
              Custom
            </span>
            <div className="grid">
              <CustomFields rule={draft} startIso={startIso} onChange={setDraft} withEnds />
            </div>
            <span className={css({ display: "flex", justifyContent: "flex-end", gap: "2" })}>
              <Button size="sm" variant="ghost" tone="neutral" onClick={() => setPopover(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="solid"
                tone="neutral"
                onClick={() => {
                  set({ rule: draft });
                  setPopover(false);
                }}
              >
                Done
              </Button>
            </span>
          </div>
        </Popover>
      ) : null}
      <span className="label">Starts</span>
      <span>
        <DateButton label="Starts" iso={startIso} onPick={(iso) => set({ startIso: iso })} />
      </span>
      <span className="label">At</span>
      <Select
        required
        searchable
        size="sm"
        aria-label="At"
        items={times.map((time) => ({ value: time, text: time }))}
        value={at}
        onChange={(value) => set({ at: value ?? at })}
      />
      <span className="label">Time zone</span>
      <Select
        required
        searchable
        size="sm"
        aria-label="Time zone"
        items={zoneItems(startIso)}
        value={zone}
        onChange={(value) => set({ zone: value ?? zone })}
      />
      {take === "g1" && !rule.once ? (
        <EndsFields rule={rule} startIso={startIso} onChange={(next) => set({ rule: next })} />
      ) : null}
      <span className="label">Next runs</span>
      <span className={mutedLine} data-next-runs>
        {runs.length === 0
          ? "None"
          : runs.map((date, index) => (
              <span key={isoOf(date)}>
                {runWords(date, at)}
                {index < runs.length - 1 ? " ·" : ""}
              </span>
            ))}
      </span>
    </>
  );
};

/** Shared with the layout takes in `schedule-form-layouts.tsx`. */
export type { Ends, Monthly, Unit };
export {
  dayLetter,
  dayNames,
  isLastWeek,
  nthOf,
  ordinal,
  parse,
  quickChoices,
  runWords,
  times,
  unitItems,
  weekday,
  zoneItems,
};
