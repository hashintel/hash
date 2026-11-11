/**
 * Triggers are read-only in the editor (Aakarsh, 4 Nov): "in editors view you can see the ghost like version for all
 * possible triggers. during a run, you just see the one that was activated."
 *
 * - Three ghost nodes sit left of Start: Manual, Schedule and Responsive. A kind that is on is drawn at 50%, one
 *   that is off at 25%.
 * - Clicking one opens the Triggers panel (P3·B, Figma J4.3 849:23796, panel 1140:796). Each section opens in place,
 *   and an opened trigger holds its on/off switch.
 * - Editing happens on the flows-level page ("Edit flow triggers ↗", Q·B, 4 Nov), never here, so the panel has no
 *   add-trigger flow.
 *
 * MOCK: the flow's triggers. Only the Monthly supplier review has any; every other flow has none, with manual runs
 * off.
 */
import { Fragment, useState } from "react";

import {
  Button,
  Icon,
  type IconName,
  SegmentedControl,
  TextInput,
  Toggle,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { navigate, parseRoute } from "./router";
import { TextLink } from "./text-link";
import { type EditorDocument } from "./document";
import { useEditor } from "./editor-context";
import { headerIconStyle } from "./menu-rows";
import {
  formatCount,
  ghostLayout,
  scaleCounts,
  triggerCount,
  triggerMockState,
  triggerPanelAtScale,
  triggerScaleTake,
} from "./trigger-flags";

export type GhostKind = "manual" | "schedule" | "responsive";

export const ghostKinds: GhostKind[] = ["manual", "schedule", "responsive"];

export const ghostId = (kind: GhostKind) => `ghost:${kind}`;

export const ghostKindOf = (id: string | null | undefined) =>
  ghostKinds.find((kind) => ghostId(kind) === id);

type FlowTrigger = {
  id: string;
  kind: Exclude<GhostKind, "manual">;
  label: string;
  /** A few words for a ghost node's line ("Mondays"). */
  short?: string;
  on: boolean;
  details: { label: string; value: string; link?: string }[];
};

type FlowTriggers = {
  manual: boolean;
  items: FlowTrigger[];
  /** Triggers in webs this person can't view: counted, never shown. */
  hidden: number;
};

const supplierReviewTriggers: FlowTriggers = {
  manual: true,
  items: [
    {
      id: "monthly",
      kind: "schedule",
      label: "1st of every month at 09:00",
      short: "1st of month",
      on: true,
      details: [
        { label: "Runs", value: "1st of every month at 09:00 (London)" },
        { label: "Next run", value: "1 Dec, 09:00" },
        { label: "Web", value: "@aakarsh" },
        { label: "Flow version", value: "v5" },
        { label: "Created by", value: "Dora" },
      ],
    },
    {
      id: "monday",
      kind: "schedule",
      label: "Every Monday at 08:00",
      short: "Mondays",
      on: true,
      details: [
        { label: "Runs", value: "Every Monday at 08:00 (London)" },
        { label: "Next run", value: "Mon 9 Nov, 08:00" },
        { label: "Web", value: "@aakarsh" },
        { label: "Flow version", value: "v4", link: "Upgrade to v5" },
        { label: "Created by", value: "Aakarsh" },
      ],
    },
    {
      id: "supplierCreated",
      kind: "responsive",
      label: "When a Supplier is created",
      short: "Supplier created",
      on: false,
      details: [
        { label: "Runs", value: "When a Supplier is created" },
        { label: "Web", value: "@aakarsh" },
        { label: "Flow version", value: "v5" },
        { label: "Created by", value: "Konstantin" },
      ],
    },
  ],
  hidden: 1,
};

/**
 * The canvas takes' mock (`trigger-flags.ts`): all on (Manual on, Schedule 2, Responsive 1), the off variant (Manual
 * off, Responsive 0) or nothing that can start the flow. Without a take, the mock as it is.
 */
const takeTriggers = (triggers: FlowTriggers): FlowTriggers => {
  switch (triggerMockState) {
    case "on":
      return {
        ...triggers,
        manual: true,
        items: triggers.items.map((item) => ({ ...item, on: true })),
      };
    case "off":
      return {
        ...triggers,
        manual: false,
        items: triggers.items.filter((item) => item.kind === "schedule"),
      };
    case "none":
      return { manual: false, items: [], hidden: 0 };
    case null:
      return triggers;
  }
};

export const flowTriggersOf = (
  document: EditorDocument,
  switches: Record<string, boolean> = {},
): FlowTriggers => {
  const base: FlowTriggers =
    document.name === "Monthly supplier review"
      ? takeTriggers(supplierReviewTriggers)
      : { manual: false, items: [], hidden: 0 };
  return {
    ...base,
    manual: switches.manual ?? base.manual,
    items: base.items.map((item) => ({
      ...item,
      on: switches[item.id] ?? item.on,
    })),
  };
};

/** The flow's triggers, with the switches flipped in this session. */
export const useFlowTriggers = (): FlowTriggers => {
  const { document, ui } = useEditor();
  return flowTriggersOf(document, ui.triggerSwitches);
};

/** What a ghost node says: its kind, a one-line summary, and whether any of it is on (50%) or not (25%). */
export const ghostSummary = (
  triggers: FlowTriggers,
  kind: GhostKind,
): { title: string; line: string; icon: IconName; on: boolean } => {
  if (kind === "manual") {
    return {
      title: "Manual",
      line: triggers.manual ? "On" : "Off",
      icon: "user",
      on: triggers.manual,
    };
  }
  const items = triggers.items.filter((item) => item.kind === kind);
  const on = items.filter((item) => item.on).length;
  const paused = items.length - on;
  if (kind === "schedule") {
    return {
      title: "Schedule",
      // Kind as the title, then what is on (10 Nov, inbox triggers-scale: 3), as Responsive reads.
      line:
        items.length === 0
          ? "None"
          : [on > 0 ? `${on} on` : "", paused > 0 ? `${paused} paused` : ""]
              .filter(Boolean)
              .join(" · "),
      icon: "calendar",
      on: on > 0,
    };
  }
  return {
    title: "Responsive",
    line:
      items.length === 0
        ? "None"
        : [on > 0 ? `${on} on` : "", paused > 0 ? `${paused} paused` : ""]
            .filter(Boolean)
            .join(" · "),
    icon: "cube",
    on: on > 0,
  };
};

const kindTitle: Record<GhostKind, string> = {
  manual: "Manual",
  schedule: "Schedule",
  responsive: "Responsive",
};

const kindIcon: Record<GhostKind, IconName> = {
  manual: "user",
  schedule: "calendar",
  responsive: "cube",
};

/**
 * What a ghost node says under a take (`trigger-flags.ts`): a title, then a second line or a count at the right
 * (the rails), and whether any of the kind is on (70%) or not (25%).
 */
export const ghostTakeSummary = (
  triggers: FlowTriggers,
  kind: GhostKind,
): {
  title: string;
  line?: string;
  count?: string;
  icon: IconName;
  on: boolean;
} => {
  const icon = kindIcon[kind];
  if (triggerScaleTake) {
    const counts = scaleCounts[triggerCount];
    if (kind === "manual") {
      const state = counts.manual ? "On" : "Off";
      return triggerScaleTake === 2 || triggerScaleTake === 4
        ? { title: "Manual", count: state, icon, on: counts.manual }
        : { title: "Manual", line: state, icon, on: counts.manual };
    }
    const { on, paused } = counts[kind];
    const total = on + paused;
    const word = kind === "schedule" ? "schedule" : "responsive";
    switch (triggerScaleTake) {
      case 1:
        return {
          title: `${formatCount(total)} ${word}${kind === "schedule" && total !== 1 ? "s" : ""}`,
          line: paused > 0 ? `${formatCount(paused)} paused` : "All on",
          icon,
          on: on > 0,
        };
      case 2:
      case 4:
        return {
          title:
            kind === "schedule"
              ? "Schedule"
              : triggerScaleTake === 2
                ? "Event"
                : "Responsive",
          count: formatCount(total),
          icon,
          on: on > 0,
        };
      default:
        return {
          title: kindTitle[kind],
          line: [
            `${formatCount(on)} on`,
            paused > 0 ? `${formatCount(paused)} paused` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          icon,
          on: on > 0,
        };
    }
  }
  const items =
    kind === "manual"
      ? []
      : triggers.items.filter((item) => item.kind === kind);
  const on =
    kind === "manual" ? triggers.manual : items.some((item) => item.on);
  const onCount = items.filter((item) => item.on).length;
  if (ghostLayout === "rail") {
    return {
      title: kindTitle[kind],
      count:
        kind === "manual"
          ? triggers.manual
            ? "On"
            : "Off"
          : `${items.length}`,
      icon,
      on,
    };
  }
  if (kind === "manual") {
    const line =
      ghostLayout === "column"
        ? triggers.manual
          ? "Run button"
          : "Off"
        : triggers.manual
          ? "On"
          : "Off";
    return { title: "Manual", line, icon, on };
  }
  switch (ghostLayout) {
    case "bracket":
      return {
        title: kindTitle[kind],
        line:
          items.length === 0
            ? "None"
            : `${items.length} trigger${items.length === 1 ? "" : "s"}`,
        icon,
        on,
      };
    case "fan":
      return {
        title: kindTitle[kind],
        line: onCount === 0 ? "None" : `${onCount} on`,
        icon,
        on,
      };
    default:
      return {
        title: `${kindTitle[kind]} · ${items.length}`,
        line:
          items.length === 0
            ? "None"
            : items.map((item) => item.short ?? item.label).join(", "),
        icon,
        on,
      };
  }
};

/** Which row a ghost opens on: J4.3 opens the Schedule ghost on "Every Monday at 08:00". */
export const openedFor: Record<GhostKind, string | null> = {
  manual: null,
  schedule: "monday",
  responsive: "supplierCreated",
};

/* ----------------------------------------------------------------------------------------------------------------
 * The Triggers panel
 * ------------------------------------------------------------------------------------------------------------- */

/** Sections run edge to edge with a hairline between them, inside the panel's 16 px padding. */
const blockStyle = css({
  marginX: "[-16px]",
  paddingX: "4",
  paddingTop: "4",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
});

// Triggers panel B (inbox triggers-panel): group labels, field labels and states are fg.muted (#8d8d8d).
const groupLabelStyle = css({
  textStyle: "sm",
  color: "neutral.fg.muted",
  paddingY: "2",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  width: "[100%]",
  minHeight: "[40px]",
  paddingX: "2",
  marginX: "[-8px]",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  textStyle: "sm",
  color: "neutral.fg.heading",
  _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  "&[aria-expanded=true]": { backgroundColor: "neutral.bgSolid.surface" },
});

const stateStyle = css({ textStyle: "sm", color: "neutral.fg.muted" });

const detailGridStyle = css({
  display: "grid",
  gridTemplateColumns: "[112px 1fr]",
  rowGap: "0",
  paddingLeft: "7",
  paddingY: "1",
  "& > span": {
    minHeight: "[32px]",
    display: "flex",
    alignItems: "center",
    textStyle: "sm",
    whiteSpace: "nowrap",
  },
});

/** The Flows › Triggers page for the flow open in the editor. */
export const openTriggersPage = () => {
  const route = parseRoute(globalThis.location.pathname, globalThis.location.search);
  navigate(route.page === "editor" ? `/flows/${route.flowId}/triggers` : "/flows/triggers");
};

const iconFor: Record<FlowTrigger["kind"], IconName> = {
  schedule: "calendarClock",
  responsive: "cube",
};

const groups: { kind: FlowTrigger["kind"]; label: string }[] = [
  { kind: "schedule", label: "Schedules" },
  { kind: "responsive", label: "When something happens" },
];

const TriggersPanelToday = ({ kind }: { kind: GhostKind }) => {
  const { setUi } = useEditor();
  const triggers = useFlowTriggers();
  const [opened, setOpened] = useState<string | null>(openedFor[kind]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const flip = (id: string, on: boolean) =>
    setUi((current) => ({
      ...current,
      triggerSwitches: { ...current.triggerSwitches, [id]: on },
    }));
  const shown = triggers.items.filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <div
        className={css({ display: "flex", gap: "3", alignItems: "flex-start" })}
      >
        <span
          className={cx(
            headerIconStyle,
            css({ color: "neutral.fg.muted" }),
          )}
        >
          <Icon name="lightning" size="sm" />
        </span>
        <span
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "0.5",
          })}
        >
          <span
            className={css({
              textStyle: "sm",
              fontWeight: "medium",
              color: "neutral.fg.heading",
            })}
          >
            Triggers
          </span>
          <span className={css({ textStyle: "sm", color: "neutral.fg.muted" })}>
            What can start this flow
          </span>
        </span>
      </div>
      <div
        className={cx(
          blockStyle,
          css({ display: "flex", alignItems: "center", gap: "3" }),
        )}
      >
        <span
          className={css({
            flex: "1",
            display: "flex",
            flexDirection: "column",
            gap: "0.5",
          })}
        >
          <span
            className={css({ textStyle: "sm", color: "neutral.fg.heading" })}
          >
            Manual runs
          </span>
          <span className={css({ textStyle: "sm", color: "neutral.fg.muted" })}>
            Show a Run button on this flow
          </span>
        </span>
        <span className={stateStyle}>{triggers.manual ? "On" : "Off"}</span>
        <Toggle
          size="sm"
          aria-label="Manual runs"
          value={triggers.manual}
          onChange={(on) => flip("manual", on)}
        />
      </div>
      <div
        className={cx(
          blockStyle,
          css({ display: "flex", flexDirection: "column", paddingTop: "3" }),
        )}
      >
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: "[32px]",
          })}
        >
          <span
            className={css({
              textStyle: "sm",
              fontWeight: "medium",
              color: "neutral.fg.heading",
            })}
          >
            Triggers · {triggers.items.length}
          </span>
          <Button
            size="xs"
            variant="ghost"
            tone="neutral"
            iconName="search"
            className={css({
              color: "neutral.fg.body",
              "& svg": { width: "[16px]", height: "[16px]" },
            })}
            aria-label="Search triggers"
            onClick={() => {
              setSearching(!searching);
              setQuery("");
            }}
          />
        </div>
        {searching ? (
          <TextInput
            value={query}
            onChange={setQuery}
            placeholder="Search triggers"
            size="sm"
          />
        ) : null}
        {groups.map((group) => {
          const items = shown.filter((item) => item.kind === group.kind);
          if (items.length === 0) {
            return null;
          }
          return (
            <div
              key={group.kind}
              className={css({ display: "flex", flexDirection: "column" })}
            >
              <span className={groupLabelStyle}>{group.label}</span>
              {items.map((item) => {
                const open = opened === item.id;
                return (
                  <div key={item.id} data-trigger-row={item.id}>
                    {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the row holds the switch, which can't sit inside a button */}
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                      className={rowStyle}
                      onClick={() => setOpened(open ? null : item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setOpened(open ? null : item.id);
                        }
                      }}
                    >
                      <span
                        className={css({
                          display: "inline-flex",
                          color: "neutral.fg.body",
                        })}
                      >
                        <Icon name={iconFor[item.kind]} size="sm" />
                      </span>
                      <span className={css({ flex: "1" })}>{item.label}</span>
                      <span className={stateStyle}>
                        {item.on
                          ? "On"
                          : item.kind === "responsive"
                            ? "Paused"
                            : "Off"}
                      </span>
                      {open ? (
                        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- keeps the switch's click off the row
                        <span onClick={(event) => event.stopPropagation()}>
                          <Toggle
                            size="sm"
                            aria-label={`${item.label} on`}
                            value={item.on}
                            onChange={(on) => flip(item.id, on)}
                          />
                        </span>
                      ) : null}
                    </div>
                    {open ? (
                      <div className={detailGridStyle}>
                        {item.details.map((detail) => (
                          <Fragment key={detail.label}>
                            <span
                              className={css({ color: "neutral.fg.muted" })}
                            >
                              {detail.label}
                            </span>
                            <span
                              className={css({
                                color: "neutral.fg.heading",
                                gap: "2",
                              })}
                            >
                              {detail.value}
                              {detail.link ? (
                                <span
                                  className={css({
                                    color: "neutral.fg.muted",
                                    textDecoration: "underline",
                                  })}
                                >
                                  {detail.link}
                                </span>
                              ) : null}
                            </span>
                          </Fragment>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
        {triggers.items.length === 0 ? (
          <span className={groupLabelStyle}>
            No schedules or responsive triggers yet
          </span>
        ) : null}
        {triggers.hidden > 0 ? (
          <span
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "3",
              minHeight: "[40px]",
              textStyle: "sm",
              color: "neutral.fg.muted",
            })}
          >
            <span className={css({ display: "inline-flex", color: "neutral.fg.body" })}>
              <Icon name="lockClosed" size="sm" />
            </span>
            {triggers.hidden} more trigger{triggers.hidden === 1 ? "" : "s"} in
            a web you can&apos;t view
          </span>
        ) : null}
        <span className={css({ paddingTop: "2" })}>
          {/* Stays inside Flows, so no ↗ (11 Nov convergence A19). */}
          <TextLink onClick={openTriggersPage}>Edit flow triggers</TextLink>
        </span>
      </div>
    </>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The Triggers panel at 1,000 (`?triggerscale=panel`, Q4, Figma 1229:664 and 1229:820)
 * ------------------------------------------------------------------------------------------------------------- */

type ScaleRow = {
  id: string;
  kind: FlowTrigger["kind"];
  label: string;
  /** The web it runs in, when it isn't this one. */
  web?: string;
  on: boolean;
};

/** MOCK: a sample of the flow's 14 schedules and 1,284 responsive triggers; the totals are counted, not listed. */
const scaleTotals = {
  schedule: { on: 12, paused: 2 },
  responsive: { on: 1240, paused: 44 },
} as const;

const scaleSchedules: ScaleRow[] = [
  ["Every weekday at 07:00", true],
  ["Every Monday at 08:00", true],
  ["1st of every month at 09:00", true],
  ["Every Friday at 17:00", false],
  ["Every day at 06:00", true],
  ["Every day at 18:00", true],
  ["Every Tuesday at 09:30", true],
  ["Every Wednesday at 12:00", true],
  ["Every Thursday at 16:00", true],
  ["15th of every month at 09:00", true],
  ["Last day of every month at 17:00", false],
  ["Every Saturday at 10:00", true],
  ["Every Sunday at 20:00", true],
  ["1st of every quarter at 08:00", true],
].map(([label, on], index) => ({
  id: `schedule-${index}`,
  kind: "schedule" as const,
  label: String(label),
  on: Boolean(on),
}));

const scaleResponsive: ScaleRow[] = [
  ["When a Certificate is created", "@hash", true],
  ["When a Contract is created", "@legal", true],
  ["When an Invoice is updated", "@acme", true],
  ["When a Supplier is created", undefined, false],
  ["When a Certificate is created", "@acme", true],
  ["When a Contract is created", "@acme", true],
  ["When a Contract is updated", "@acme", true],
  ["When an Invoice is archived", "@acme", false],
  ["When an Invoice is created", "@acme", true],
  ["When a Payment is created", "@acme", true],
  ["When an Order is created", "@acme", true],
  ["When an Order is updated", "@acme", true],
  ["When a Shipment is created", "@acme", true],
  ["When a Shipment is updated", "@acme", false],
  ["When a Supplier is updated", "@acme", true],
  ["When a Delivery note is created", "@ops", true],
].map(([label, web, on], index) => ({
  id: `responsive-${index}`,
  kind: "responsive" as const,
  label: String(label),
  ...(web ? { web: String(web) } : {}),
  on: Boolean(on),
}));

/** Search reads the sample in the order a person would scan it: the trigger's words, then its web. */
const byLabel = (rows: ScaleRow[]) =>
  [...rows].sort((left, right) =>
    left.label.localeCompare(right.label, "en-GB"),
  );

type ScaleFilter = "all" | "on" | "paused";

const scaleGroups: {
  kind: FlowTrigger["kind"];
  label: string;
  rows: ScaleRow[];
}[] = [
  { kind: "schedule", label: "Schedules", rows: scaleSchedules },
  {
    kind: "responsive",
    label: "When something happens",
    rows: scaleResponsive,
  },
];

const showMoreStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minHeight: "[36px]",
  paddingLeft: "7",
  textStyle: "sm",
  color: "neutral.fg.subtle",
});

const TriggersPanelAtScale = () => {
  const [manual, setManual] = useState(false);
  const [filter, setFilter] = useState<ScaleFilter>("all");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [shownPerGroup, setShownPerGroup] = useState<Record<string, number>>(
    {},
  );
  const term = query.trim().toLowerCase();
  const keeps = (row: ScaleRow) =>
    (filter === "all" || (filter === "on") === row.on) &&
    (term === "" ||
      `${row.label} ${row.web ?? ""}`.toLowerCase().includes(term));
  const totalOf = (kind: FlowTrigger["kind"]) => {
    const { on, paused } = scaleTotals[kind];
    return filter === "all" ? on + paused : filter === "on" ? on : paused;
  };
  const shownGroups = scaleGroups.map((group) => {
    const rows = group.rows.filter(keeps);
    return {
      ...group,
      rows: term === "" ? rows : byLabel(rows),
      // Searching counts what matched; at rest, the kind's real total.
      total: term === "" ? totalOf(group.kind) : rows.length,
    };
  });
  const matches = shownGroups.reduce(
    (sum, group) => sum + group.rows.length,
    0,
  );
  const total =
    scaleTotals.schedule.on +
    scaleTotals.schedule.paused +
    scaleTotals.responsive.on +
    scaleTotals.responsive.paused;
  return (
    <>
      <div
        className={css({ display: "flex", gap: "3", alignItems: "flex-start" })}
      >
        <span
          className={cx(
            headerIconStyle,
            css({ color: "neutral.fg.muted" }),
          )}
        >
          <Icon name="lightning" size="sm" />
        </span>
        <span
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "0.5",
          })}
        >
          <span
            className={css({
              textStyle: "sm",
              fontWeight: "medium",
              color: "neutral.fg.heading",
            })}
          >
            Triggers
          </span>
          <span className={css({ textStyle: "sm", color: "neutral.fg.muted" })}>
            What can start this flow
          </span>
        </span>
      </div>
      <div
        className={cx(
          blockStyle,
          css({ display: "flex", alignItems: "center", gap: "3" }),
        )}
      >
        <span
          className={css({
            flex: "1",
            display: "flex",
            flexDirection: "column",
            gap: "0.5",
          })}
        >
          <span
            className={css({ textStyle: "sm", color: "neutral.fg.heading" })}
          >
            Manual runs
          </span>
          <span className={css({ textStyle: "sm", color: "neutral.fg.muted" })}>
            Show a Run button on this flow
          </span>
        </span>
        <span className={stateStyle}>{manual ? "On" : "Off"}</span>
        <Toggle
          size="sm"
          aria-label="Manual runs"
          value={manual}
          onChange={setManual}
        />
      </div>
      <div
        className={cx(
          blockStyle,
          css({
            display: "flex",
            flexDirection: "column",
            paddingTop: "3",
            gap: "1",
          }),
        )}
        data-triggers-at-scale
      >
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "3",
            minHeight: "[32px]",
          })}
        >
          {searching ? (
            <>
              <span className={css({ flex: "1" })}>
                <TextInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Search triggers"
                  size="sm"
                  prefix={{ iconName: "search", variant: "subtle" }}
                  aria-label="Search triggers"
                />
              </span>
              {term === "" ? null : (
                <span className={stateStyle}>
                  {matches} {matches === 1 ? "match" : "matches"}
                </span>
              )}
              <Button
                size="xs"
                variant="ghost"
                tone="neutral"
                iconName="close"
                aria-label="Stop searching"
                onClick={() => {
                  setSearching(false);
                  setQuery("");
                }}
              />
            </>
          ) : (
            <>
              <span
                className={css({
                  textStyle: "sm",
                  fontWeight: "medium",
                  color: "neutral.fg.heading",
                })}
              >
                Triggers · {formatCount(total)}
              </span>
              <Button
                size="xs"
                variant="ghost"
                tone="neutral"
                iconName="search"
                aria-label="Search triggers"
                onClick={() => setSearching(true)}
              />
            </>
          )}
        </div>
        <span className={css({ paddingY: "1" })}>
          <SegmentedControl<ScaleFilter>
            size="sm"
            aria-label="Show triggers"
            items={[
              { value: "all", label: "All" },
              { value: "on", label: "On" },
              { value: "paused", label: "Paused" },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </span>
        {shownGroups.map((group) => {
          if (group.rows.length === 0) {
            return null;
          }
          const limit = term === "" ? (shownPerGroup[group.kind] ?? 4) : 50;
          const rows = group.rows.slice(0, limit);
          return (
            <div
              key={group.kind}
              className={css({ display: "flex", flexDirection: "column" })}
            >
              <span className={groupLabelStyle}>
                {group.label} · {formatCount(group.total)}
              </span>
              {rows.map((row) => (
                <div
                  key={row.id}
                  className={cx(rowStyle, css({ cursor: "default" }))}
                  data-trigger-row={row.id}
                >
                  <span
                    className={css({
                      display: "inline-flex",
                      color: "neutral.fg.muted",
                    })}
                  >
                    <Icon name={iconFor[row.kind]} size="sm" />
                  </span>
                  <span
                    className={css({
                      flex: "1",
                      minWidth: "[0]",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    })}
                  >
                    {row.label}
                    {row.web ? (
                      <span className={css({ color: "neutral.fg.subtle" })}>
                        {" "}
                        · {row.web}
                      </span>
                    ) : null}
                  </span>
                  <span className={stateStyle}>{row.on ? "On" : "Paused"}</span>
                </div>
              ))}
              {term === "" && group.total > rows.length ? (
                <span className={showMoreStyle}>
                  Showing {formatCount(rows.length)} of{" "}
                  {formatCount(group.total)}
                  {group.rows.length > rows.length ? (
                    <button
                      type="button"
                      className={css({
                        color: "neutral.fg.muted",
                        textDecoration: "underline",
                        cursor: "pointer",
                      })}
                      onClick={() =>
                        setShownPerGroup((current) => ({
                          ...current,
                          [group.kind]: limit + 10,
                        }))
                      }
                    >
                      Show more
                    </button>
                  ) : null}
                </span>
              ) : null}
            </div>
          );
        })}
        {term !== "" && matches === 0 ? (
          <span className={groupLabelStyle}>No triggers match</span>
        ) : null}
        {term === "" ? (
          <span
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "2",
              minHeight: "[40px]",
              textStyle: "sm",
              color: "neutral.fg.subtle",
            })}
          >
            <Icon name="lockClosed" size="sm" />6 more triggers in webs you
            can&apos;t view
          </span>
        ) : null}
        <span className={css({ paddingTop: "2" })}>
          {/* Stays inside Flows, so no ↗ (11 Nov convergence A19). */}
          <TextLink onClick={openTriggersPage}>Edit flow triggers</TextLink>
        </span>
      </div>
    </>
  );
};

/** The Triggers panel: today's P3·B, or the same panel at 1,000 triggers under `?triggerscale=panel`. */
export const TriggersPanel = ({ kind }: { kind: GhostKind }) =>
  triggerPanelAtScale ? (
    <TriggersPanelAtScale />
  ) : (
    <TriggersPanelToday kind={kind} />
  );
