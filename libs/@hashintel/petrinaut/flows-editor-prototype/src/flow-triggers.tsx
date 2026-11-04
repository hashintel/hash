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
  TextInput,
  Toggle,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { type EditorDocument } from "./document";
import { useEditor } from "./editor-context";

export type GhostKind = "manual" | "schedule" | "responsive";

export const ghostKinds: GhostKind[] = ["manual", "schedule", "responsive"];

export const ghostId = (kind: GhostKind) => `ghost:${kind}`;

export const ghostKindOf = (id: string | null | undefined) =>
  ghostKinds.find((kind) => ghostId(kind) === id);

type FlowTrigger = {
  id: string;
  kind: Exclude<GhostKind, "manual">;
  label: string;
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

export const flowTriggersOf = (
  document: EditorDocument,
  switches: Record<string, boolean> = {},
): FlowTriggers => {
  const base: FlowTriggers =
    document.name === "Monthly supplier review"
      ? supplierReviewTriggers
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

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

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
      line:
        items.length === 0
          ? "None"
          : paused > 0
            ? `${plural(items.length, "schedule")} · ${paused} paused`
            : plural(items.length, "schedule"),
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

const groupLabelStyle = css({
  textStyle: "sm",
  color: "neutral.fg.subtle",
  paddingY: "2",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  minHeight: "[40px]",
  paddingX: "2",
  marginX: "[-8px]",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  textStyle: "sm",
  color: "neutral.fg.heading",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
  "&[aria-expanded=true]": { backgroundColor: "neutral.bgSolid.surface" },
});

const stateStyle = css({ textStyle: "sm", color: "neutral.fg.subtle" });

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

/** The flows-level triggers page is not in the prototype: a stub in a new tab. */
const openFlowTriggers = (flow: string) => {
  const html = `<!doctype html><meta charset="utf-8"><title>Flow triggers</title><body style="font:14px system-ui;margin:48px;color:#202020"><p style="color:#8d8d8d">Stub · Flows prototype</p><h1 style="font-size:20px">Flow triggers · ${flow}</h1><p>The flows-level page where triggers are added and edited (Q·B, 4 Nov). Not built yet.</p></body>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  globalThis.open(url, "_blank", "noopener");
};

const iconFor: Record<FlowTrigger["kind"], IconName> = {
  schedule: "calendarClock",
  responsive: "cube",
};

const groups: { kind: FlowTrigger["kind"]; label: string }[] = [
  { kind: "schedule", label: "Schedules" },
  { kind: "responsive", label: "When something happens" },
];

export const TriggersPanel = ({ kind }: { kind: GhostKind }) => {
  const { document, setUi } = useEditor();
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
        className={css({ display: "flex", gap: "2", alignItems: "flex-start" })}
      >
        <span
          className={css({
            display: "inline-flex",
            color: "neutral.fg.muted",
            paddingTop: "[1px]",
          })}
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
                          color: "neutral.fg.muted",
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
                              className={css({ color: "neutral.fg.subtle" })}
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
              gap: "2",
              minHeight: "[40px]",
              textStyle: "sm",
              color: "neutral.fg.subtle",
            })}
          >
            <Icon name="lockClosed" size="sm" />
            {triggers.hidden} more trigger{triggers.hidden === 1 ? "" : "s"} in
            a web you can&apos;t view
          </span>
        ) : null}
        <span className={css({ paddingTop: "2" })}>
          <Button
            size="sm"
            variant="subtle"
            tone="neutral"
            iconName="arrowUpRight"
            iconPosition="right"
            onClick={() => openFlowTriggers(document.name)}
          >
            Edit flow triggers
          </Button>
        </span>
      </div>
    </>
  );
};
