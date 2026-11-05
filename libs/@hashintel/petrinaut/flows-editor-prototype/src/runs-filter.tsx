/**
 * The Logs filter ribbon, B (inbox run-filter, Figma 1096:209; ledger 4 Nov: status tabs, plus the DS Filter for
 * anything more, plus sorting). Each applied filter is a DS Filter chip, "Status · is · Failed", with a ⋮ that edits
 * or removes it. "+" opens "Filter by…" in two groups, Run and Steps and data. The ribbon ends with Clear and Save.
 *
 * DS diff: the code chip ends in ✕; Figma's ends in ⋮ with Edit and Remove, so the chip is drawn without its ✕ and a
 * DS ghost button with a DS Menu follows it.
 */
import { useRef, useState } from "react";

import {
  Button,
  Filter,
  type FilterChange,
  FilterGroup,
  type FilterOperator,
  type FilterValue,
  Icon,
  type IconName,
  type ItemOrGroup,
  Menu,
  type MenuItem,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  certificateName,
  factsOf,
  outcomeOf,
  type RunOutcome,
  type RunRecord,
  runClock,
  suppliers,
} from "./run-history";
import { SearchHeader } from "./source-menu";

export type RunFilterValues = {
  is: string;
  isNot: string;
  within: string;
  longerThan: number;
  shorterThan: number;
  contains: string;
};

export type FilterProperty =
  | "status"
  | "trigger"
  | "by"
  | "started"
  | "duration"
  | "failedAt"
  | "version"
  | "value";

export type RunFilterChip = {
  id: number;
  property: FilterProperty;
  value: FilterValue<RunFilterValues> | null;
  /** Added just now: the chip takes focus and opens its value list. */
  fresh?: boolean;
};

type Operator = FilterOperator<RunFilterValues>;

/** Status words, finer than the tabs (a run with warnings is one way of Completed). */
const statusWords: Record<RunOutcome, string> = {
  error: "Failed",
  abandoned: "Abandoned",
  needsReview: "Needs review",
  running: "Running",
  warnings: "Completed with warnings",
  completed: "Completed",
};

const periods: { value: string; text: string; days: number }[] = [
  { value: "7d", text: "Last 7 days", days: 7 },
  { value: "30d", text: "Last 30 days", days: 30 },
  { value: "6m", text: "Last 6 months", days: 183 },
  { value: "12m", text: "Last 12 months", days: 365 },
];

/**
 * MOCK: runs carry no flow version, so each takes the version live on its day, from the seeded versions of Monthly
 * supplier review (`seed-flows.ts`). Runs older than v1's date count as v1.
 */
const versions = [
  { n: 5, from: new Date(2026, 10, 3) },
  { n: 4, from: new Date(2026, 9, 28) },
  { n: 3, from: new Date(2026, 9, 21) },
  { n: 2, from: new Date(2026, 9, 9) },
  { n: 1, from: new Date(0) },
];

const months = [
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

/** "Today, 10:42", "2 Nov, 16:20", "18 Nov 2025, 14:30": the day a run started. */
const startedOn = (run: RunRecord, now: number) => {
  const today = new Date(now);
  const day = run.when.split(",")[0]?.trim() ?? "";
  if (day === "Today") {
    return today;
  }
  const match = /^(\d{1,2}) (\w{3})(?: (\d{4}))?$/.exec(day);
  return match
    ? new Date(
        Number(match[3] ?? today.getFullYear()),
        months.indexOf(match[2] ?? ""),
        Number(match[1]),
      )
    : today;
};

/** "1m 52s", "48h 02m": a past run's duration in seconds; a live run counts its clock. */
export const durationSeconds = (run: RunRecord, now: number) => {
  if (run.kind === "live") {
    return runClock(run, now);
  }
  const part = (unit: string) =>
    Number(new RegExp(`(\\d+)\\s*${unit}`).exec(run.duration ?? "")?.[1] ?? 0);
  return part("h") * 3600 + part("m") * 60 + part("s");
};

/** The steps a run failed at, by their names in the flow. */
const failedAt = (run: RunRecord, now: number) => {
  const facts = factsOf(run, now);
  return [
    ...(facts.find === "failed" ? ["Find active suppliers"] : []),
    ...(facts.failures.length > 0 ? ["Fetch certificate"] : []),
    ...(facts.signOff === "timedOut" ? ["Quality sign-off"] : []),
  ];
};

/** The values a run read and wrote: its suppliers, their certificate files, and why any fetch failed. */
const runValues = (run: RunRecord, now: number) => {
  const facts = factsOf(run, now);
  const names = suppliers.slice(0, facts.n);
  return [
    ...names,
    ...names.map(certificateName),
    ...facts.failures.map((failure) => failure.reason),
  ];
};

/** What a property reads off a run, for "is" and for listing the choices some run has. */
const facetOf = (
  property: FilterProperty,
  run: RunRecord,
  now: number,
): string[] => {
  switch (property) {
    case "status":
      return [outcomeOf(run, now)];
    case "trigger":
      return [run.trigger.kind];
    case "by":
      return run.trigger.kind === "manual" ? [run.trigger.by] : [];
    case "failedAt":
      return failedAt(run, now);
    case "version": {
      const on = startedOn(run, now);
      return [`v${versions.find((version) => on >= version.from)?.n ?? 1}`];
    }
    default:
      return [];
  }
};

const facetText = (property: FilterProperty, value: string) =>
  property === "status"
    ? statusWords[value as RunOutcome]
    : property === "trigger"
      ? value === "manual"
        ? "Manual"
        : "Schedule"
      : value;

type PropertyDef = {
  label: string;
  icon: IconName;
  group: "Run" | "Steps and data";
};

const properties: Record<FilterProperty, PropertyDef> = {
  status: { label: "Status", icon: "circleCheck", group: "Run" },
  trigger: { label: "Trigger", icon: "calendarClock", group: "Run" },
  by: { label: "Started by", icon: "user", group: "Run" },
  started: { label: "Started", icon: "calendar", group: "Run" },
  duration: { label: "Duration", icon: "clock", group: "Run" },
  failedAt: { label: "Failed at step", icon: "close", group: "Steps and data" },
  version: {
    label: "Flow version",
    icon: "clockRotateLeft",
    group: "Steps and data",
  },
  value: {
    label: "Input or output value",
    icon: "search",
    group: "Steps and data",
  },
};

/** A property's operators, its choices being the values some run has (so no list is empty). */
const operatorsOf = (
  property: FilterProperty,
  runs: RunRecord[],
  now: number,
): Operator[] => {
  if (property === "started") {
    return [
      {
        key: "within",
        label: "within",
        input: {
          type: "select",
          items: periods.map(({ value, text }) => ({ value, text })),
        },
      },
    ];
  }
  if (property === "duration") {
    return [
      {
        key: "longerThan",
        label: "longer than",
        input: { type: "number", placeholder: "min", min: 0 },
      },
      {
        key: "shorterThan",
        label: "shorter than",
        input: { type: "number", placeholder: "min", min: 0 },
      },
    ];
  }
  if (property === "value") {
    return [
      {
        key: "contains",
        label: "contains",
        input: { type: "string", placeholder: "Supplier, file…" },
      },
    ];
  }
  const items = [
    ...new Set(runs.flatMap((run) => facetOf(property, run, now))),
  ].map((value) => ({ value, text: facetText(property, value) }));
  return [
    { key: "is", label: "is", input: { type: "select", items } },
    { key: "isNot", label: "is not", input: { type: "select", items } },
  ];
};

/** The operator a new chip opens on, so its value list opens straight away. */
const firstOperator = (property: FilterProperty): keyof RunFilterValues =>
  property === "started"
    ? "within"
    : property === "duration"
      ? "longerThan"
      : property === "value"
        ? "contains"
        : "is";

const chipMatches = (chip: RunFilterChip, run: RunRecord, now: number) => {
  const value = chip.value;
  if (!value || value.value === null) {
    return true;
  }
  switch (value.key) {
    case "is":
      return facetOf(chip.property, run, now).includes(value.value);
    case "isNot":
      return !facetOf(chip.property, run, now).includes(value.value);
    case "within": {
      const days = periods.find((period) => period.value === value.value)?.days;
      return (
        !days || now - startedOn(run, now).getTime() <= days * 24 * 3600 * 1000
      );
    }
    case "longerThan":
      return durationSeconds(run, now) > value.value * 60;
    case "shorterThan":
      return durationSeconds(run, now) < value.value * 60;
    case "contains": {
      const needle = value.value.trim().toLowerCase();
      return runValues(run, now).some((text) =>
        text.toLowerCase().includes(needle),
      );
    }
  }
};

export const passesChips = (
  chips: RunFilterChip[],
  run: RunRecord,
  now: number,
) => chips.every((chip) => chipMatches(chip, run, now));

/** Chips with a value: the count on the Filter button. */
export const appliedChips = (chips: RunFilterChip[]) =>
  chips.filter((chip) => chip.value && chip.value.value !== null).length;

export const newChip = (
  chips: RunFilterChip[],
  property: FilterProperty,
): RunFilterChip[] => [
  ...chips,
  {
    id: Math.max(0, ...chips.map((chip) => chip.id)) + 1,
    property,
    value: { key: firstOperator(property), value: null },
    fresh: true,
  },
];

/** "Filter by…": a search, then the properties in two groups (Figma 1096:209). */
export const FilterByMenu = ({
  trigger,
  onPick,
}: {
  trigger: React.ReactElement;
  onPick: (property: FilterProperty) => void;
}) => {
  const [search, setSearch] = useState("");
  const text = search.trim().toLowerCase();
  const groups = (["Run", "Steps and data"] as const)
    .map((group) => ({
      id: group,
      label: group,
      items: (Object.keys(properties) as FilterProperty[])
        .filter(
          (property) =>
            properties[property].group === group &&
            properties[property].label.toLowerCase().includes(text),
        )
        .map((property): MenuItem => ({
          id: property,
          text: properties[property].label,
          icon: properties[property].icon,
          onClick: () => {
            setSearch("");
            onPick(property);
          },
        })),
    }))
    .filter((group) => group.items.length > 0);
  const items: Array<ItemOrGroup<MenuItem>> =
    groups.length > 0
      ? groups
      : [
          {
            id: "nothing",
            label: "",
            items: [
              {
                id: "nothing",
                text: "Nothing matches",
                disabled: true,
                onClick: () => undefined,
              },
            ],
          },
        ];
  return (
    <Menu
      position="bottom-start"
      header={
        <SearchHeader
          value={search}
          onChange={setSearch}
          placeholder="Filter by…"
          focusOnOpen
        />
      }
      items={items}
      trigger={trigger}
    />
  );
};

const ribbonStyle = css({
  "&[class]": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "2",
  },
});

/** The chip and its ⋮ as one chip: the DS chip's right edge squared off, the ⋮ its last segment (Figma 1096:209). */
const chipStyle = css({
  display: "inline-flex",
  alignItems: "stretch",
  "& [role=group][data-property]": {
    borderTopRightRadius: "[0]",
    borderBottomRightRadius: "[0]",
  },
  "& [role=group][data-property] > :last-child": {
    borderInlineEnd: "none",
    borderStartEndRadius: "[0]",
    borderEndEndRadius: "[0]",
  },
});

/** The chip's ⋮ segment: the DS chip's borders (outline a50, divider a40), 5 px outer corners, a 16 px icon. */
const chipMenuStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[24px]",
  height: "[28px]",
  padding: "0",
  cursor: "pointer",
  color: "neutral.fg.muted",
  backgroundColor: "neutral.bgSolid.min",
  borderBlock: "[1px solid var(--colors-neutral-a50)]",
  borderInlineEnd: "[1px solid var(--colors-neutral-a50)]",
  borderInlineStart: "[1px solid var(--colors-neutral-a40)]",
  borderTopRightRadius: "[5px]",
  borderBottomRightRadius: "[5px]",
  "& svg": { width: "[16px]", height: "[16px]" },
  _hover: { backgroundColor: "neutral.a25" },
  _focusVisible: { outline: "[2px solid var(--colors-neutral-a80)]" },
});

/** One applied filter: the DS chip, then its ⋮ (Edit opens the value; Remove drops the chip). */
const RunFilterChipView = ({
  chip,
  runs,
  now,
  onChange,
  onRemove,
}: {
  chip: RunFilterChip;
  runs: RunRecord[];
  now: number;
  onChange: (value: FilterValue<RunFilterValues> | null) => void;
  onRemove: () => void;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const label = properties[chip.property].label;
  // Edit: the chip's last segment is its value; clicking it opens the value's list or focuses its field.
  const edit = () =>
    setTimeout(() => {
      const segments = ref.current?.querySelectorAll<HTMLElement>(
        "[role=group][data-property] button, [role=group][data-property] input",
      );
      const last = segments?.[segments.length - 1];
      last?.focus();
      last?.click();
    }, 60);
  return (
    // The chip's own segments differ by design (12 px operator, 26 px value, a square ⋮); the row check skips it.
    <span
      ref={ref}
      className={chipStyle}
      data-run-filter={chip.property}
      data-control-check="skip"
    >
      <Filter<RunFilterValues>
        property={`${chip.property}-${chip.id}`}
        propertyLabel={label}
        operators={operatorsOf(chip.property, runs, now)}
        value={chip.value}
        onChange={(...change: FilterChange<RunFilterValues>) => {
          const [key, value] = change;
          onChange({ key, value } as FilterValue<RunFilterValues>);
        }}
        removeable={false}
        autoFocus={chip.fresh ?? false}
      />
      <Menu
        position="bottom-end"
        items={[
          { id: "edit", text: "Edit", onClick: edit },
          { id: "remove", text: "Remove", onClick: onRemove },
        ]}
        trigger={
          <button
            type="button"
            className={chipMenuStyle}
            aria-label={`${label} filter options`}
          >
            <Icon name="ellipsisVertical" size="sm" />
          </button>
        }
      />
    </span>
  );
};

/** The ribbon under the status tabs while any filter is on: chips, "+", then Clear and Save at the end. */
export const RunsFilterRibbon = ({
  chips,
  onChips,
  runs,
  now,
  onSave,
}: {
  chips: RunFilterChip[];
  onChips: (chips: RunFilterChip[]) => void;
  runs: RunRecord[];
  now: number;
  onSave: () => void;
}) => (
  <FilterGroup className={ribbonStyle}>
    {chips.map((chip) => (
      <RunFilterChipView
        key={chip.id}
        chip={chip}
        runs={runs}
        now={now}
        onChange={(value) =>
          onChips(
            chips.map((each) =>
              each.id === chip.id ? { ...each, value } : each,
            ),
          )
        }
        onRemove={() => onChips(chips.filter((each) => each.id !== chip.id))}
      />
    ))}
    <FilterByMenu
      onPick={(property) => onChips(newChip(chips, property))}
      trigger={<FilterGroup.AddFilter />}
    />
    <span className={css({ flex: "1" })} />
    {/* Clear and Save as one pair at the row's size (14 px Medium), not the DS group's smaller Clear label. */}
    <Button
      size="sm"
      variant="ghost"
      tone="neutral"
      onClick={() => onChips([])}
    >
      Clear
    </Button>
    <Button size="sm" variant="ghost" tone="neutral" onClick={onSave}>
      Save
    </Button>
  </FilterGroup>
);
