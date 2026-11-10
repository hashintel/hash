/**
 * Three layouts for the schedule form, behind `?scheduleform=a|b|c` on top of `?triggeradd=g1|g2` (no param keeps
 * today's G1/G2 form). Same fields and the same rule in each; only the layout changes.
 * - `a`: today's fields in three groups (When, Ends, Runs as) with more space between groups, one control width,
 *   the Figma DS ToggleGroup for the weekdays, Next runs as a faint line under When.
 * - `b`: a one-line summary sentence (when and where only; Ends lives in its own row), the When fields under it, Ends and Runs as one line each that open on click
 *   (`&schedopen=ends,runs` lands with them open).
 * - `c`: Google Calendar's Custom recurrence dialog in the panel: labels above their controls, "Repeat every 2 weeks"
 *   as one line, Ends as Google's three radio rows, Web and Flow version side by side.
 *
 * Weekday toggles are a local build of the Figma DS ToggleGroup (ghost, sm 28; page ToggleGroup, node 20771:2627):
 * the code DS has none. Selected = `neutral/bg/subtle/active` fill and `fg/text/max`, as Figma's Toggle active=true;
 * the letter also goes Semi Bold, as the approved selected-row rule, because Figma's hovered active toggle drops the
 * fill.
 */
import { useRef, useState } from "react";

import {
  Button,
  Icon,
  NumberInput,
  Radio,
  Select,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { DatePopover } from "./date-picker";
import {
  dayLetter,
  dayNames,
  type Ends,
  isLastWeek,
  type Monthly,
  nextRuns,
  nthOf,
  ordinal,
  parse,
  quickChoices,
  type Rule,
  ruleSummary,
  ruleWords,
  type ScheduleValues,
  times,
  type Unit,
  unitItems,
  weekday,
  zoneItems,
  zoneName,
} from "./schedule-form";

export type ScheduleLayout = "a" | "b" | "c";

export const scheduleLayout = (): ScheduleLayout | null => {
  const value = new URLSearchParams(globalThis.location.search).get(
    "scheduleform",
  );
  return value === "a" || value === "b" || value === "c" ? value : null;
};

const openParam = () =>
  (new URLSearchParams(globalThis.location.search).get("schedopen") ?? "")
    .split(",")
    .filter(Boolean);

/* ----------------------------------------------------------------------------------------------------------------
 * Parts
 * ------------------------------------------------------------------------------------------------------------- */

const dayShortWords = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthWords = [
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
const dateWords = (iso: string) => {
  const date = parse(iso);
  return `${dayShortWords[weekday(date)]} ${date.getUTCDate()} ${monthWords[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};
const runDay = (date: Date) =>
  `${dayShortWords[weekday(date)]} ${date.getUTCDate()} ${monthWords[date.getUTCMonth()]}`;

const labelText = css({ textStyle: "sm", color: "neutral.fg.subtle" });
const bodyText = css({ textStyle: "sm", color: "neutral.fg.body" });
const faintLine = css({ textStyle: "sm", color: "neutral.fg.subtle" });
/** The Triggers panel group title ("Schedules · 4"): sm Medium heading. */
const groupTitle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
});
const row = css({ display: "flex", alignItems: "center", gap: "2" });
const numberStyle = css({
  width: "[52px]",
  flexShrink: 0,
  "& input": { textAlign: "center" },
});

/** Figma DS ToggleGroup, ghost sm: seven 28 px toggles, no gap, selected on the active fill. */
const toggleItem = css({
  width: "[28px]",
  minWidth: "[28px]",
  paddingX: "0",
  justifyContent: "center",
  color: "neutral.fg.heading",
  "&[aria-pressed=true], &[aria-pressed=true]:hover": {
    "--button-bg": "var(--colors-neutral-bg-subtle-active)",
    borderColor: "[transparent]",
    boxShadow: "[none]",
    color: "neutral.fg.max",
    fontWeight: "semibold",
  },
});

const DayToggles = ({
  rule,
  onChange,
}: {
  rule: Rule;
  onChange: (rule: Rule) => void;
}) => (
  <span
    role="group"
    aria-label="On"
    className={css({ display: "inline-flex", gap: "0" })}
    data-day-toggles
  >
    {dayLetter.map((letter, day) => {
      const on = rule.days.includes(day);
      return (
        <Button
          // eslint-disable-next-line react/no-array-index-key -- seven fixed weekdays
          key={day}
          size="sm"
          variant="ghost"
          tone="neutral"
          aria-label={dayNames[day]}
          aria-pressed={on}
          className={toggleItem}
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
  </span>
);

/**
 * Stand-in for the Figma DS `input_datepicker` (sm 28, calendar icon left; node 42265:34456), which the code DS
 * lacks: a DS subtle Button, left-aligned, at the column's width.
 */
const DateField = ({
  label,
  iso,
  onPick,
  disabled,
  width,
}: {
  label: string;
  iso: string;
  onPick: (iso: string) => void;
  disabled?: boolean;
  width: string;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <span style={{ width, display: "inline-flex", flexShrink: 0 }}>
      <Button
        ref={ref}
        size="sm"
        variant="subtle"
        tone="neutral"
        aria-label={label}
        iconName="calendar"
        iconPosition="left"
        disabled={disabled}
        className={css({ width: "full", justifyContent: "flex-start", fontWeight: "normal" })}
        onClick={() => setOpen((current) => !current)}
      >
        {dateWords(iso)}
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
    </span>
  );
};

const monthItems = (startIso: string) => {
  const start = parse(startIso);
  return [
    { value: "date", text: `On the ${ordinal(start.getUTCDate())}` },
    {
      value: "nth",
      text: `On the ${ordinal(nthOf(start))} ${dayNames[weekday(start)]}`,
    },
    ...(isLastWeek(start)
      ? [{ value: "last", text: `On the last ${dayNames[weekday(start)]}` }]
      : []),
  ];
};

const endItems = [
  { value: "never", text: "Never" },
  { value: "on", text: "On a date" },
  { value: "after", text: "After" },
];

/** The Repeat list, the rule's "custom" state and the picker, shared by every layout. */
const useRepeat = (
  values: ScheduleValues,
  onChange: (values: ScheduleValues) => void,
  initialCustom: boolean,
) => {
  const { startIso, rule } = values;
  const quick = quickChoices(startIso);
  const [custom, setCustom] = useState(initialCustom);
  const items = [
    ...quick.map((choice) => ({ value: choice.value, text: choice.value })),
    { value: "custom", text: "Custom…" },
  ];
  const pick = (value: string | null) => {
    if (value === "custom") {
      setCustom(true);
      return;
    }
    const choice = quick.find((candidate) => candidate.value === value);
    if (choice) {
      setCustom(false);
      onChange({
        ...values,
        rule: {
          ...choice.rule,
          ends: rule.ends,
          endIso: rule.endIso,
          count: rule.count,
        },
      });
    }
  };
  return {
    custom,
    items,
    pick,
    value: custom ? "custom" : ruleWords(rule, startIso),
  };
};

export type RunsAs = {
  web: string;
  webs: string[];
  onWeb: (web: string) => void;
  version: string;
  versions: string[];
};

const VersionSelect = ({ runsAs }: { runsAs: RunsAs }) => {
  const [version, setVersion] = useState(runsAs.version);
  return (
    <Select
      required
      size="sm"
      aria-label="Flow version"
      items={runsAs.versions.map((value) => ({ value, text: value }))}
      value={version}
      onChange={(value) => setVersion(value ?? version)}
    />
  );
};

const WebSelect = ({ runsAs }: { runsAs: RunsAs }) => (
  <Select
    required
    size="sm"
    aria-label="Web"
    items={runsAs.webs.map((value) => ({ value, text: value }))}
    value={runsAs.web}
    onChange={(value) => runsAs.onWeb(value ?? runsAs.web)}
  />
);

const Actions = ({
  saveLabel,
  onSave,
  onCancel,
}: {
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
}) => (
  <span className={css({ display: "flex", gap: "2" })}>
    <Button size="sm" variant="solid" tone="neutral" onClick={onSave}>
      {saveLabel}
    </Button>
    <Button size="sm" variant="ghost" tone="neutral" onClick={onCancel}>
      Cancel
    </Button>
  </span>
);

const nextRunsWords = (values: ScheduleValues) => {
  const runs = nextRuns(values.rule, values.startIso);
  return runs.length === 0
    ? "No runs"
    : `Next runs ${runs.map(runDay).join(", ")}`;
};

/* ----------------------------------------------------------------------------------------------------------------
 * The form
 * ------------------------------------------------------------------------------------------------------------- */

type Props = {
  layout: ScheduleLayout;
  values: ScheduleValues;
  onChange: (values: ScheduleValues) => void;
  initialCustom: boolean;
  runsAs: RunsAs;
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
};

/** One control width for every field in takes a and b. */
const controlWidth = 320;

const gridA = css({
  display: "grid",
  gridTemplateColumns: `[160px ${controlWidth}px]`,
  columnGap: "4",
  rowGap: "3",
  alignItems: "center",
  "& > .title": { gridColumn: "[1 / -1]" },
  "& > .label": { textStyle: "sm", color: "neutral.fg.subtle" },
});

const LayoutAB = ({
  values,
  onChange,
  initialCustom,
  runsAs,
  saveLabel,
  onSave,
  onCancel,
  progressive,
}: Props & { progressive: boolean }) => {
  const { startIso, rule, at, zone } = values;
  const repeat = useRepeat(values, onChange, initialCustom);
  const set = (patch: Partial<ScheduleValues>) =>
    onChange({ ...values, ...patch });
  const setRule = (next: Rule) => set({ rule: next });
  const opened = openParam();
  const [endsOpen, setEndsOpen] = useState(!progressive || opened.includes("ends"));
  const [runsOpen, setRunsOpen] = useState(!progressive || opened.includes("runs"));

  const endsFields = rule.once ? null : (
    <>
      {/* a: the group title names it; b: the fold line does. */}
      <span className="label" />
      <span className={row}>
        <span className={css({ width: "[160px]", flexShrink: 0 })}>
          <Select
            required
            size="sm"
            aria-label="Ends"
            items={endItems}
            value={rule.ends}
            onChange={(value) =>
              setRule({ ...rule, ends: (value ?? rule.ends) as Ends })
            }
          />
        </span>
        {rule.ends === "on" ? (
          <DateField
            label="Ends on"
            iso={rule.endIso < startIso ? startIso : rule.endIso}
            onPick={(iso) => setRule({ ...rule, endIso: iso })}
            width="152px"
          />
        ) : rule.ends === "after" ? (
          <>
            <NumberInput
              size="sm"
              aria-label="Runs"
              value={rule.count}
              min={1}
              max={730}
              hideStepper
              className={numberStyle}
              onChange={(value) => setRule({ ...rule, count: value ?? 1 })}
            />
            <span className={bodyText}>runs</span>
          </>
        ) : null}
      </span>
    </>
  );

  const runsFields = (
    <>
      <span className="label">Web</span>
      <WebSelect runsAs={runsAs} />
      <span className="label">Flow version</span>
      <VersionSelect runsAs={runsAs} />
    </>
  );

  /**
   * b: one line that opens its fields, standing in for the Figma DS Accordion header (the code DS has no Accordion).
   * The chevron is the Accordion's 16 px chevron-down, but it sits 4 px after the value, not at the row's far right as
   * in Figma, so it reads as part of the value. The whole row takes the DS hover fill.
   */
  const foldLine = (
    title: string,
    value: string,
    open: boolean,
    toggle: () => void,
  ) => (
    <button
      type="button"
      aria-expanded={open}
      onClick={toggle}
      className={css({
        gridColumn: "[1 / -1]",
        display: "grid",
        gridTemplateColumns: `[160px ${controlWidth}px]`,
        columnGap: "4",
        alignItems: "center",
        minHeight: "[28px]",
        // The fill reaches 8 px past the text on both sides; the text keeps its column.
        marginX: "[-8px]",
        paddingX: "[8px]",
        width: "[calc(100% + 16px)]",
        textAlign: "left",
        cursor: "pointer",
        borderRadius: "md",
        "&:hover": { backgroundColor: "[var(--colors-neutral-bg-subtle-hover)]" },
        "& .chevron": {
          display: "inline-flex",
          color: "neutral.fg.body",
          transition: "[transform 120ms]",
        },
        "&[aria-expanded=true] .chevron": { transform: "[rotate(180deg)]" },
      })}
    >
      <span className={groupTitle}>{title}</span>
      <span className={css({ display: "flex", alignItems: "center", gap: "1" })}>
        <span className={bodyText}>{value}</span>
        <span className="chevron">
          <Icon name="chevronDown" size="sm" />
        </span>
      </span>
    </button>
  );

  const endsValue =
    rule.ends === "never"
      ? "Never"
      : rule.ends === "on"
        ? `On ${dateWords(rule.endIso)}`
        : `After ${rule.count} runs`;

  return (
    <div
      className={css({ display: "flex", flexDirection: "column", gap: "7" })}
      data-schedule-layout={progressive ? "b" : "a"}
    >
      {progressive ? (
        <span
          className={css({
            textStyle: "base",
            fontWeight: "medium",
            color: "neutral.fg.heading",
          })}
          data-schedule-summary
        >
          {`${ruleSummary(rule, startIso, at)}, ${zoneName(zone)}`}
        </span>
      ) : null}
      <div className={gridA}>
        {progressive ? null : <span className={cx("title", groupTitle)}>When</span>}
        <span className="label">Repeat</span>
        <Select
          required
          size="sm"
          aria-label="Repeat"
          items={repeat.items}
          value={repeat.value}
          onChange={repeat.pick}
        />
        {repeat.custom ? (
          <>
            <span className="label">Repeat every</span>
            <span className={row}>
              <NumberInput
                size="sm"
                aria-label="Repeat every"
                value={rule.every}
                min={1}
                max={99}
                hideStepper
                className={numberStyle}
                onChange={(value) => setRule({ ...rule, every: value ?? 1 })}
              />
              <span className={css({ flex: "1" })}>
                <Select
                  required
                  size="sm"
                  aria-label="Unit"
                  items={unitItems(rule.every)}
                  value={rule.unit}
                  onChange={(value) =>
                    setRule({ ...rule, unit: (value ?? rule.unit) as Unit })
                  }
                />
              </span>
            </span>
            {rule.unit === "week" ? (
              <>
                <span className="label">On</span>
                <DayToggles rule={rule} onChange={setRule} />
              </>
            ) : null}
            {rule.unit === "month" ? (
              <>
                <span className="label">On</span>
                <Select
                  required
                  size="sm"
                  aria-label="Day of the month"
                  items={monthItems(startIso)}
                  value={rule.monthly}
                  onChange={(value) =>
                    setRule({ ...rule, monthly: (value ?? rule.monthly) as Monthly })
                  }
                />
              </>
            ) : null}
          </>
        ) : null}
        <span className="label">Starts</span>
        <DateField
          label="Starts"
          iso={startIso}
          onPick={(iso) => set({ startIso: iso })}
          width={`${controlWidth}px`}
        />
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
        <span />
        <span className={faintLine} data-next-runs>
          {nextRunsWords(values)}
        </span>
      </div>
      {rule.once ? null : (
        <div className={gridA}>
          {progressive ? (
            foldLine("Ends", endsValue, endsOpen, () => setEndsOpen((open) => !open))
          ) : (
            <span className={cx("title", groupTitle)}>Ends</span>
          )}
          {endsOpen ? endsFields : null}
        </div>
      )}
      <div className={gridA}>
        {progressive ? (
          foldLine(
            "Runs as",
            `${runsAs.web} · ${runsAs.version}`,
            runsOpen,
            () => setRunsOpen((open) => !open),
          )
        ) : (
          <span className={cx("title", groupTitle)}>Runs as</span>
        )}
        {runsOpen ? runsFields : null}
        <span />
        <span className={css({ paddingTop: "2" })}>
          <Actions saveLabel={saveLabel} onSave={onSave} onCancel={onCancel} />
        </span>
      </div>
    </div>
  );
};

/** c: Google Calendar's Custom recurrence, in the panel. Labels sit above their controls; 400 px wide. */
const LayoutC = ({
  values,
  onChange,
  initialCustom,
  runsAs,
  saveLabel,
  onSave,
  onCancel,
}: Props) => {
  const { startIso, rule, at, zone } = values;
  const repeat = useRepeat(values, onChange, initialCustom);
  const set = (patch: Partial<ScheduleValues>) =>
    onChange({ ...values, ...patch });
  const setRule = (next: Rule) => set({ rule: next });
  const group = css({ display: "flex", flexDirection: "column", gap: "2" });
  const endRow = css({
    display: "grid",
    gridTemplateColumns: "[72px auto]",
    alignItems: "center",
    columnGap: "3",
    minHeight: "[28px]",
  });
  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "6",
        width: "[440px]",
      })}
      data-schedule-layout="c"
    >
      <div className={group}>
        <span className={labelText}>Repeat</span>
        <Select
          required
          size="sm"
          aria-label="Repeat"
          items={repeat.items}
          value={repeat.value}
          onChange={repeat.pick}
        />
        {repeat.custom ? (
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "3",
              paddingTop: "2",
            })}
          >
            <span className={row}>
              <span className={cx(bodyText, css({ width: "[48px]" }))}>Every</span>
              <NumberInput
                size="sm"
                aria-label="Repeat every"
                value={rule.every}
                min={1}
                max={99}
                hideStepper
                className={numberStyle}
                onChange={(value) => setRule({ ...rule, every: value ?? 1 })}
              />
              <span className={css({ width: "[120px]" })}>
                <Select
                  required
                  size="sm"
                  aria-label="Unit"
                  items={unitItems(rule.every)}
                  value={rule.unit}
                  onChange={(value) =>
                    setRule({ ...rule, unit: (value ?? rule.unit) as Unit })
                  }
                />
              </span>
            </span>
            {rule.unit === "week" ? (
              <span className={row}>
                <span className={cx(bodyText, css({ width: "[48px]" }))}>On</span>
                <DayToggles rule={rule} onChange={setRule} />
              </span>
            ) : null}
            {rule.unit === "month" ? (
              <Select
                required
                size="sm"
                aria-label="Day of the month"
                items={monthItems(startIso)}
                value={rule.monthly}
                onChange={(value) =>
                  setRule({ ...rule, monthly: (value ?? rule.monthly) as Monthly })
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className={group}>
        <span className={labelText}>Starts</span>
        <span className={row}>
          <DateField
            label="Starts"
            iso={startIso}
            onPick={(iso) => set({ startIso: iso })}
            width="152px"
          />
          <span className={css({ width: "[100px]", flexShrink: 0 })}>
            <Select
              required
              searchable
              size="sm"
              aria-label="At"
              items={times.map((time) => ({ value: time, text: time }))}
              value={at}
              onChange={(value) => set({ at: value ?? at })}
            />
          </span>
          <span className={css({ flex: "1", minWidth: "0" })}>
            <Select
              required
              searchable
              size="sm"
              aria-label="Time zone"
              items={zoneItems(startIso)}
              value={zone}
              onChange={(value) => set({ zone: value ?? zone })}
            />
          </span>
        </span>
        <span className={faintLine} data-next-runs>
          {nextRunsWords(values)}
        </span>
      </div>
      {rule.once ? null : (
        <div className={group}>
          <span className={labelText}>Ends</span>
          <span className={endRow}>
            <Radio
              size="sm"
              label="Never"
              value={rule.ends === "never"}
              onChange={() => setRule({ ...rule, ends: "never" })}
            />
          </span>
          <span className={endRow}>
            <Radio
              size="sm"
              label="On"
              value={rule.ends === "on"}
              onChange={() => setRule({ ...rule, ends: "on" })}
            />
            <DateField
              label="Ends on"
              iso={rule.endIso < startIso ? startIso : rule.endIso}
              onPick={(iso) => setRule({ ...rule, endIso: iso, ends: "on" })}
              disabled={rule.ends !== "on"}
              width="152px"
            />
          </span>
          <span className={endRow}>
            <Radio
              size="sm"
              label="After"
              value={rule.ends === "after"}
              onChange={() => setRule({ ...rule, ends: "after" })}
            />
            <span className={row}>
              <NumberInput
                size="sm"
                aria-label="Runs"
                value={rule.count}
                min={1}
                max={730}
                hideStepper
                disabled={rule.ends !== "after"}
                className={numberStyle}
                onChange={(value) => setRule({ ...rule, count: value ?? 1 })}
              />
              <span className={rule.ends === "after" ? bodyText : faintLine}>runs</span>
            </span>
          </span>
        </div>
      )}
      <div className={group}>
        <span className={labelText}>Runs as</span>
        <span className={css({ display: "grid", gridTemplateColumns: "[1fr 1fr]", gap: "2" })}>
          <WebSelect runsAs={runsAs} />
          <VersionSelect runsAs={runsAs} />
        </span>
      </div>
      <Actions saveLabel={saveLabel} onSave={onSave} onCancel={onCancel} />
    </div>
  );
};

export const ScheduleFormLayout = (props: Props) =>
  props.layout === "c" ? (
    <LayoutC {...props} />
  ) : (
    <LayoutAB {...props} progressive={props.layout === "b"} />
  );
