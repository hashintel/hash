/**
 * The Flows › Triggers page, where triggers are added and edited (Q·B, 4 Nov: the editor's Triggers panel is
 * read-only and links here). Not the default yet: the page is a stub unless a take is asked for.
 *
 * - `?triggerspage=1..4`: Q3's four layouts (Figma 1220:106516).
 *   1. By flow: each flow a section with its manual switch and triggers; editing opens a panel on the right.
 *   2. One quiet table across flows, with search and Flow / Web / Status filters; the open row expands in place.
 *   3. A flow picker on the left; on the right the P3·B panel at page width, edited in place, the switch inside the
 *      open trigger.
 *   4. One flat two-line list; a trigger opens on its own page under a breadcrumb.
 * - `?triggeropen=<trigger id>` lands with that trigger open (`monday` is "Every Monday at 08:00").
 * - `?triggeradd=1..3`: the add flow on take 3 (Figma 1148:208–2158, 1222:107082): 1 the + menu, 2 a new schedule
 *   open in its group, 3 the confirm before turning off a schedule.
 *
 * MOCK: everything here. The Monthly supplier review's triggers are the editor panel's (`flowTriggersOf`); Onboard
 * new supplier and Weekly digest exist only on this page.
 */
import { useEffect, useRef, useState } from "react";

import {
  BreadCrumbs,
  Button,
  Icon,
  type IconName,
  Menu,
  Popover,
  PortalContainerContext,
  SegmentedControl,
  Select,
  TextInput,
  Toggle,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { emptyDocument } from "./document";
import { flowTriggersOf } from "./flow-triggers";
import { HashShell } from "./hash-shell";
import { firstLineIconStyle } from "./menu-rows";
import { navigate } from "./router";
import {
  customPreset,
  endsWords,
  ruleSummary,
  ScheduleFields,
  type ScheduleValues,
  scheduleFormTake,
  scheduleShow,
  scheduleStart,
  zoneName,
} from "./schedule-form";
import { ScheduleFormLayout, scheduleLayout } from "./schedule-form-layouts";
import { monthlyReviewId } from "./seed-flows";

/** The status filter, as the Triggers panel draws it (approved L26): All · On · Paused. */
type StatusFilter = "all" | "on" | "paused";

type Take = 1 | 2 | 3 | 4;

const query = () => new URLSearchParams(globalThis.location.search);

/** `?triggerspage=1..4`, from the URL only. */
export const triggersPageTake = (): Take | null => {
  const take = Number(query().get("triggerspage"));
  return take === 1 || take === 2 || take === 3 || take === 4 ? take : null;
};

/** `?triggeradd=1..3`, from the URL only. */
export const triggerAddStep = (): 1 | 2 | 3 | null => {
  // `?triggeradd=g1|g2` (schedule-form.tsx) open a new schedule, as 2 does, with the Google Calendar fields.
  if (scheduleFormTake()) {
    return 2;
  }
  const step = Number(query().get("triggeradd"));
  return step === 1 || step === 2 || step === 3 ? step : null;
};

/* ----------------------------------------------------------------------------------------------------------------
 * Data
 * ------------------------------------------------------------------------------------------------------------- */

type Kind = "schedule" | "responsive";

type Values = {
  flowId: string;
  repeat: string;
  at: string;
  timeZone: string;
  web: string;
  entityType: string;
  event: string;
  /** `?triggeradd=g1|g2`: the row's own words, written by the schedule form. */
  label?: string;
};

type PageTrigger = Values & {
  id: string;
  kind: Kind;
  label: string;
  version: string;
  /** Set when a newer version is published: "Upgrade to v5". */
  latest?: string;
  /** "Failed to activate" outranks on and off. */
  failed?: boolean;
  /** "Mon 9 Nov at 08:00": named in the confirm before a schedule is turned off. */
  nextRun?: string;
};

type PageFlow = {
  id: string;
  name: string;
  latest: string;
  manual: boolean;
  /** Triggers in webs this person can't view: counted, never shown. */
  hidden: number;
};

const onboardId = "onboard-new-supplier";
const digestId = "weekly-digest";

/** Form values the panel's mock has no field for, keyed by its trigger ids. */
const supplierReviewForm: Record<string, Partial<Values>> = {
  monthly: { repeat: "Monthly on day 1", at: "09:00" },
  monday: { repeat: "Weekly on Monday", at: "08:00" },
  supplierCreated: { entityType: "Supplier", event: "Is created" },
};

const blank: Omit<Values, "flowId"> = {
  repeat: "Every weekday (Monday to Friday)",
  at: "09:00",
  timeZone: "London (GMT)",
  web: "@aakarsh",
  entityType: "Supplier",
  event: "Is created",
};

const supplierReview = (): { flow: PageFlow; triggers: PageTrigger[] } => {
  const source = flowTriggersOf(emptyDocument("Monthly supplier review"));
  const detail = (
    item: (typeof source.items)[number],
    label: string,
  ): { value: string; link?: string } | undefined =>
    item.details.find((candidate) => candidate.label === label);
  return {
    flow: {
      id: monthlyReviewId,
      name: "Monthly supplier review",
      latest: "v5",
      manual: source.manual,
      hidden: source.hidden,
    },
    triggers: source.items.map((item) => ({
      ...blank,
      ...supplierReviewForm[item.id],
      flowId: monthlyReviewId,
      id: item.id,
      kind: item.kind,
      label: item.label,
      web: detail(item, "Web")?.value ?? blank.web,
      version: detail(item, "Flow version")?.value ?? "v5",
      latest: detail(item, "Flow version")?.link?.replace("Upgrade to ", ""),
      nextRun: detail(item, "Next run")?.value.replace(", ", " at "),
    })),
  };
};

const seed = () => {
  const review = supplierReview();
  const flows: PageFlow[] = [
    review.flow,
    {
      id: onboardId,
      name: "Onboard new supplier",
      latest: "v2",
      manual: false,
      hidden: 0,
    },
    {
      id: digestId,
      name: "Weekly digest",
      latest: "v3",
      manual: true,
      hidden: 0,
    },
  ];
  const triggers: PageTrigger[] = [
    ...review.triggers,
    {
      ...blank,
      flowId: onboardId,
      id: "onboardSupplierCreated",
      kind: "responsive",
      label: "When a Supplier is created",
      web: "@hash",
      version: "v2",
    },
    {
      ...blank,
      flowId: digestId,
      id: "friday",
      kind: "schedule",
      label: "Every Friday at 17:00",
      repeat: "Weekly on Friday",
      at: "17:00",
      web: "@aakarsh",
      version: "v3",
      failed: true,
    },
  ];
  const on: Record<string, boolean> = {
    monthly: true,
    monday: true,
    supplierCreated: false,
    onboardSupplierCreated: true,
    friday: true,
  };
  for (const item of flowTriggersOf(emptyDocument("Monthly supplier review"))
    .items) {
    on[item.id] = item.on;
  }
  for (const flow of flows) {
    on[`manual:${flow.id}`] = flow.manual;
  }
  return { flows, triggers, on };
};

const iconFor: Record<Kind, IconName> = {
  schedule: "calendarClock",
  responsive: "cube",
};

const groups: { kind: Kind; label: string }[] = [
  { kind: "schedule", label: "Schedules" },
  { kind: "responsive", label: "When something happens" },
];

const statusText = (trigger: PageTrigger, on: boolean) =>
  trigger.failed
    ? "Failed to activate"
    : on
      ? "On"
      : trigger.kind === "responsive"
        ? "Paused"
        : "Off";

const metaOf = (trigger: PageTrigger) => `${trigger.web} · ${trigger.version}`;

/** A new schedule's name, from its Repeat and At. */
const scheduleLabel = (values: Values) => {
  const at = `at ${values.at}`;
  switch (values.repeat) {
    case "Does not repeat":
      return `Once, 3 Nov ${at}`;
    case "Daily":
      return `Every day ${at}`;
    case "Every weekday (Monday to Friday)":
      return `Every weekday ${at}`;
    case "Custom…":
      return `Custom schedule ${at}`;
    default:
      if (values.repeat.startsWith("Weekly on ")) {
        return `Every ${values.repeat.replace("Weekly on ", "")} ${at}`;
      }
      if (values.repeat.startsWith("Monthly on the first ")) {
        return `First ${values.repeat.replace("Monthly on the first ", "")} of every month ${at}`;
      }
      if (values.repeat.startsWith("Annually on ")) {
        return `Every year on ${values.repeat.replace("Annually on ", "")} ${at}`;
      }
      return `${values.repeat} ${at}`;
  }
};

const eventLabel = (values: Values) =>
  `When a ${values.entityType} ${values.event.replace("Is ", "is ")}`;

/* ----------------------------------------------------------------------------------------------------------------
 * Styles: P3·B's language. No chips, badges or cards; status as a word; two text greys; hairlines.
 * ------------------------------------------------------------------------------------------------------------- */

const hairline = {
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
} as const;

const headingText = css({ textStyle: "sm", color: "neutral.fg.heading" });
const mutedText = css({ textStyle: "sm", color: "neutral.fg.muted" });
const subtleText = css({ textStyle: "sm", color: "neutral.fg.subtle" });

const iconCell = css({
  display: "inline-flex",
  flexShrink: 0,
  color: "neutral.fg.muted",
});

const rowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  width: "[100%]",
  minHeight: "[40px]",
  paddingX: "2",
  marginX: "[-8px]",
  boxSizing: "content-box",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  textStyle: "sm",
  color: "neutral.fg.heading",
  _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  "&[aria-expanded=true]": { backgroundColor: "neutral.bgSolid.surface" },
});

const twoLineRowStyle = cx(
  rowStyle,
  css({ alignItems: "flex-start", paddingY: "2" }),
);

const lockStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  minHeight: "[40px]",
  textStyle: "sm",
  color: "neutral.fg.subtle",
});

const FailedDot = () => (
  <span
    aria-hidden
    className={css({
      width: "[6px]",
      height: "[6px]",
      borderRadius: "full",
      backgroundColor: "red.s50",
    })}
  />
);

/** Status as a word; a failure adds a soft red dot. */
const Status = ({ trigger, on }: { trigger: PageTrigger; on: boolean }) => (
  <span
    className={css({
      display: "inline-flex",
      alignItems: "center",
      gap: "1.5",
      flexShrink: 0,
      textStyle: "sm",
      color: "neutral.fg.subtle",
      whiteSpace: "nowrap",
    })}
  >
    {trigger.failed ? <FailedDot /> : null}
    {statusText(trigger, on)}
  </span>
);

const LockLine = ({ count }: { count: number }) =>
  count > 0 ? (
    <span className={lockStyle}>
      <span className={iconCell}>
        <Icon name="lockClosed" size="sm" />
      </span>
      {count} more trigger{count === 1 ? "" : "s"} in a web you can&apos;t view
    </span>
  ) : null;

/* ----------------------------------------------------------------------------------------------------------------
 * The switch, with the confirm before a schedule that has a next run is turned off
 * ------------------------------------------------------------------------------------------------------------- */

const confirmStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "[340px]",
  padding: "4",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  boxShadow: "md",
  "&:focus": { outline: "none" },
});

const TriggerSwitch = ({
  trigger,
  on,
  confirming,
  onConfirm,
  onFlip,
}: {
  trigger: PageTrigger;
  on: boolean;
  confirming: boolean;
  onConfirm: (open: boolean) => void;
  onFlip: (on: boolean) => void;
}) => {
  const anchor = useRef<HTMLSpanElement>(null);
  const focus = useRef<HTMLDivElement>(null);
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- keeps the switch's click off the row
    <span
      ref={anchor}
      className={css({ display: "inline-flex", flexShrink: 0 })}
      onClick={(event) => event.stopPropagation()}
    >
      <Toggle
        size="sm"
        aria-label={`${trigger.label} on`}
        value={on}
        onChange={(next) => {
          if (!next && trigger.kind === "schedule" && trigger.nextRun) {
            onConfirm(true);
            return;
          }
          onFlip(next);
        }}
      />
      {confirming ? (
        <Popover
          triggerRef={anchor}
          position="bottom-end"
          gapY={8}
          initialFocusRef={focus}
          onClose={() => onConfirm(false)}
        >
          <div
            ref={focus}
            tabIndex={-1}
            className={confirmStyle}
            data-trigger-confirm
          >
            <span className={cx(headingText, css({ fontWeight: "medium" }))}>
              Turn off this schedule?
            </span>
            <span className={mutedText}>
              The next run, {trigger.nextRun}, won&apos;t happen. Runs already
              in progress finish.
            </span>
            <span className={css({ display: "flex", gap: "2" })}>
              {/* Cancel, then the main action, as every figma-ds footer (11 Nov convergence A7). */}
              <Button
                size="sm"
                variant="ghost"
                tone="neutral"
                onClick={() => onConfirm(false)}
              >
                Keep on
              </Button>
              <Button
                size="sm"
                variant="solid"
                tone="neutral"
                onClick={() => {
                  onFlip(false);
                  onConfirm(false);
                }}
              >
                Turn off
              </Button>
            </span>
          </div>
        </Popover>
      ) : null}
    </span>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The form: one for editing and adding, in every take
 * ------------------------------------------------------------------------------------------------------------- */

const times = Array.from({ length: 48 }, (_, index) => {
  const hours = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hours}:${index % 2 === 0 ? "00" : "30"}`;
});

/** Google Calendar's repeat choices for a day, plus the trigger's own when it isn't one of them. */
const repeatChoices = (day: string, date: string, current: string) => {
  const base = [
    "Does not repeat",
    "Daily",
    `Weekly on ${day}`,
    `Monthly on the first ${day}`,
    `Annually on ${date}`,
    "Every weekday (Monday to Friday)",
  ];
  return [...base, ...(base.includes(current) ? [] : [current]), "Custom…"];
};

/** New schedules start from today's date in the mocks: Tuesday 3 November. */
const repeatDay = (trigger: PageTrigger | null) =>
  trigger?.repeat.startsWith("Weekly on ")
    ? trigger.repeat.replace("Weekly on ", "")
    : "Tuesday";

const dateFor: Record<string, string> = {
  Monday: "9 November",
  Friday: "6 November",
  Tuesday: "3 November",
};

const items = (values: string[]) =>
  values.map((value) => ({ value, text: value }));

const formGridStyle = css({
  display: "grid",
  gridTemplateColumns: "[160px minmax(0, 360px)]",
  columnGap: "4",
  rowGap: "2",
  alignItems: "center",
  "& > .label": { textStyle: "sm", color: "neutral.fg.subtle" },
});

const TriggerForm = ({
  trigger,
  kind,
  flowId,
  flows,
  pickFlow,
  defaultRepeatOpen,
  onSave,
  onCancel,
}: {
  /** The trigger being edited; none for a new one. */
  trigger: PageTrigger | null;
  kind: Kind;
  flowId: string;
  flows: PageFlow[];
  /** Takes 2 and 4 list every flow, so a new trigger names its flow. */
  pickFlow: boolean;
  defaultRepeatOpen?: boolean;
  onSave: (values: Values) => void;
  onCancel: () => void;
}) => {
  const [values, setValues] = useState<Values>(trigger ?? { ...blank, flowId });
  const set = (key: keyof Values) => (value: string | null) =>
    setValues((current) => ({ ...current, [key]: value ?? current[key] }));
  const flow = flows.find((candidate) => candidate.id === values.flowId);
  const day = repeatDay(trigger);
  const formTake = trigger ? null : scheduleFormTake();
  const [schedule, setSchedule] = useState<ScheduleValues | null>(() => {
    if (!formTake) {
      return null;
    }
    const start = scheduleStart();
    return scheduleShow() === "custom" && formTake === "g1"
      ? { ...start, rule: customPreset(start.startIso) }
      : start;
  });
  const valuesToSave = (): Values =>
    schedule
      ? {
          ...values,
          repeat: ruleSummary(schedule.rule, schedule.startIso, schedule.at),
          at: schedule.at,
          timeZone: zoneName(schedule.zone),
          label: `${ruleSummary(schedule.rule, schedule.startIso, schedule.at)}`,
        }
      : values;
  const layout = formTake && schedule && kind === "schedule" ? scheduleLayout() : null;
  if (layout && schedule) {
    return (
      <div className={css({ paddingY: "3" })} data-trigger-form>
        <ScheduleFormLayout
          layout={layout}
          values={schedule}
          onChange={setSchedule}
          initialCustom={scheduleShow() === "custom"}
          runsAs={{
            web: values.web,
            webs: ["@aakarsh", "@hash"],
            onWeb: set("web"),
            version: `${flow?.latest ?? "v1"} (latest)`,
            versions: [`${flow?.latest ?? "v1"} (latest)`, "v4", "v3"],
          }}
          saveLabel="Add trigger"
          onSave={() => onSave(valuesToSave())}
          onCancel={onCancel}
        />
      </div>
    );
  }
  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "5",
        paddingY: "3",
      })}
      data-trigger-form
    >
      <div className={formGridStyle}>
        {pickFlow && !trigger ? (
          <>
            <span className="label">Flow</span>
            <Select
              required
              size="sm"
              aria-label="Flow"
              items={flows.map((candidate) => ({
                value: candidate.id,
                text: candidate.name,
              }))}
              value={values.flowId}
              onChange={set("flowId")}
            />
          </>
        ) : null}
        {kind === "schedule" && formTake && schedule ? (
          <ScheduleFields
            take={formTake}
            values={schedule}
            onChange={setSchedule}
          />
        ) : kind === "schedule" ? (
          <>
            <span className="label">Repeat</span>
            <Select
              required
              size="sm"
              aria-label="Repeat"
              items={items(
                repeatChoices(day, dateFor[day] ?? "3 November", values.repeat),
              )}
              value={values.repeat}
              defaultOpen={defaultRepeatOpen}
              onChange={set("repeat")}
            />
            <span className="label">At</span>
            <Select
              required
              size="sm"
              aria-label="At"
              items={items(times)}
              value={values.at}
              onChange={set("at")}
            />
            <span className="label">Time zone</span>
            <Select
              required
              size="sm"
              aria-label="Time zone"
              items={items([
                "London (GMT)",
                "Berlin (CET)",
                "New York (EST)",
                "UTC",
              ])}
              value={values.timeZone}
              onChange={set("timeZone")}
            />
          </>
        ) : (
          <>
            <span className="label">Entity type</span>
            <Select
              required
              size="sm"
              aria-label="Entity type"
              items={items(["Supplier", "Shipment", "Incident"])}
              value={values.entityType}
              onChange={set("entityType")}
            />
            <span className="label">Event</span>
            <Select
              required
              size="sm"
              aria-label="Event"
              items={items([
                "Is created",
                "Is updated",
                "Is created or updated",
              ])}
              value={values.event}
              onChange={set("event")}
            />
          </>
        )}
        <span className="label">Web</span>
        <Select
          required
          size="sm"
          aria-label="Web"
          items={items(["@aakarsh", "@hash"])}
          value={values.web}
          onChange={set("web")}
        />
        <span className="label">Flow version</span>
        <span
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "2",
            minHeight: "[32px]",
          })}
        >
          <span className={headingText}>
            {trigger ? trigger.version : `${flow?.latest ?? "v1"} (latest)`}
          </span>
          {trigger?.latest ? (
            <span
              className={css({
                textStyle: "sm",
                color: "neutral.fg.muted",
                textDecoration: "underline",
                cursor: "pointer",
              })}
            >
              Upgrade to {trigger.latest}
            </span>
          ) : null}
        </span>
        <span />
        <span className={css({ display: "flex", gap: "2", paddingTop: "3" })}>
          <Button size="sm" variant="ghost" tone="neutral" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="solid"
            tone="neutral"
            onClick={() => onSave(valuesToSave())}
          >
            {trigger ? "Save" : "Add trigger"}
          </Button>
        </span>
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The add menu
 * ------------------------------------------------------------------------------------------------------------- */

/** Presses the pointer on an element, for DS menus that open on pointer down. */
const press = (selector: string) => {
  const element = globalThis.document.querySelector<HTMLElement>(selector);
  for (const type of [
    "pointerdown",
    "mousedown",
    "pointerup",
    "mouseup",
    "click",
  ]) {
    element?.dispatchEvent(
      new (type.startsWith("pointer") ? PointerEvent : MouseEvent)(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
  }
};

const AddMenu = ({
  onPick,
  trigger,
}: {
  onPick: (kind: Kind) => void;
  trigger: React.ReactElement;
}) => (
  <Menu
    position="bottom-end"
    className={css({ minWidth: "[320px]" })}
    items={[
      {
        id: "schedule",
        text: "On a schedule",
        description: "Runs at set times, like every Monday at 08:00",
        icon: "calendarClock",
        onClick: () => onPick("schedule"),
      },
      {
        id: "responsive",
        text: "When something happens",
        description: "Runs when an entity is created or updated",
        icon: "cube",
        onClick: () => onPick("responsive"),
      },
    ]}
    trigger={trigger}
  />
);

/** A function, not a component: the Menu passes its trigger props straight onto this button. */
const plusButton = (label: string) => (
  <Button
    size="xs"
    variant="ghost"
    tone="neutral"
    iconName="plus"
    aria-label={label}
    data-trigger-add
  />
);

/* ----------------------------------------------------------------------------------------------------------------
 * Page state, shared by every take
 * ------------------------------------------------------------------------------------------------------------- */

type Draft = { kind: Kind; flowId: string };

const usePage = (routeFlowId: string | null) => {
  const add = triggerAddStep();
  const [data, setData] = useState(() => {
    const seeded = seed();
    // `?triggeradd=g1|g2&schedshow=saved`: Custom's preset, saved as the newest schedule of the Monthly supplier review.
    if (!scheduleFormTake() || scheduleShow() !== "saved") {
      return seeded;
    }
    const start = scheduleStart();
    const rule = customPreset(start.startIso);
    const label = ruleSummary(rule, start.startIso, start.at);
    const id = "new-saved";
    return {
      ...seeded,
      triggers: [
        ...seeded.triggers,
        {
          ...blank,
          flowId: monthlyReviewId,
          repeat: label,
          timeZone: `${zoneName(start.zone)}${endsWords(rule, start.startIso)}`,
          id,
          kind: "schedule" as const,
          label,
          version: seeded.flows.find((flow) => flow.id === monthlyReviewId)?.latest ?? "v1",
        },
      ],
      on: { ...seeded.on, [id]: true },
    };
  });
  const [opened, setOpened] = useState<string | null>(() =>
    add === 3 ? "monday" : (query().get("triggeropen") ?? null),
  );
  const [confirming, setConfirming] = useState<string | null>(
    add === 3 ? "monday" : null,
  );
  const known = data.flows.some((flow) => flow.id === routeFlowId);
  const [flowId, setFlowId] = useState(
    known && routeFlowId ? routeFlowId : monthlyReviewId,
  );
  const [draft, setDraft] = useState<Draft | null>(
    add === 2 && scheduleShow() !== "saved"
      ? { kind: "schedule", flowId: monthlyReviewId }
      : null,
  );
  const flip = (id: string, on: boolean) =>
    setData((current) => ({ ...current, on: { ...current.on, [id]: on } }));
  const open = (id: string | null) => {
    setDraft(null);
    setConfirming(null);
    setOpened(id);
  };
  const startDraft = (next: Draft) => {
    setOpened(null);
    setConfirming(null);
    setDraft(next);
  };
  const saveDraft = (values: Values) => {
    if (!draft) {
      return;
    }
    const id = `new-${data.triggers.length}`;
    const flow = data.flows.find((candidate) => candidate.id === values.flowId);
    setData((current) => ({
      ...current,
      triggers: [
        ...current.triggers,
        {
          ...values,
          id,
          kind: draft.kind,
          label:
            draft.kind === "schedule"
              ? (values.label ?? scheduleLabel(values))
              : eventLabel(values),
          version: flow?.latest ?? "v1",
        },
      ],
      on: { ...current.on, [id]: true },
    }));
    setDraft(null);
  };
  const saveEdit = (id: string, values: Values) => {
    setData((current) => ({
      ...current,
      triggers: current.triggers.map((trigger) =>
        trigger.id === id ? { ...trigger, ...values } : trigger,
      ),
    }));
    setOpened(null);
  };
  return {
    ...data,
    add,
    opened,
    open,
    confirming,
    setConfirming,
    flowId,
    setFlowId: (id: string) => {
      open(null);
      setFlowId(id);
    },
    draft,
    startDraft,
    cancelDraft: () => setDraft(null),
    saveDraft,
    saveEdit,
    flip,
  };
};

type Page = ReturnType<typeof usePage>;

const switchFor = (page: Page, trigger: PageTrigger) => (
  <TriggerSwitch
    trigger={trigger}
    on={page.on[trigger.id] ?? false}
    confirming={page.confirming === trigger.id}
    onConfirm={(show) => page.setConfirming(show ? trigger.id : null)}
    onFlip={(on) => page.flip(trigger.id, on)}
  />
);

const ManualSwitch = ({ page, flow }: { page: Page; flow: PageFlow }) => {
  const on = page.on[`manual:${flow.id}`] ?? false;
  return (
    <span
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "3",
        flexShrink: 0,
      })}
    >
      <Toggle
        size="sm"
        aria-label={`Manual runs for ${flow.name}`}
        value={on}
        onChange={(next) => page.flip(`manual:${flow.id}`, next)}
      />
    </span>
  );
};

/** Opens the row on click, Enter or Space; the row can hold a switch, which can't sit inside a button. */
const rowProps = (open: boolean, onToggle: () => void) => ({
  role: "button" as const,
  tabIndex: 0,
  "aria-expanded": open,
  onClick: onToggle,
  onKeyDown: (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  },
});

/* ----------------------------------------------------------------------------------------------------------------
 * Page frame
 * ------------------------------------------------------------------------------------------------------------- */

const PageHeader = ({ right }: { right?: React.ReactNode }) => (
  <div className={css({ display: "flex", alignItems: "flex-start", gap: "4" })}>
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "[2px]",
        flex: "1",
      })}
    >
      <h1
        className={css({
          fontSize: "[28px]", // token-guard: allow DS header h1 page title is 28 px
          lineHeight: "[32px]",
          fontWeight: "semibold",
          color: "neutral.fg.heading",
          margin: "[0]",
        })}
      >
        Triggers
      </h1>
      <span
        className={css({
          textStyle: "sm",
          lineHeight: "[21px]",
          color: "neutral.fg.muted.hover",
        })}
      >
        What can start each flow
      </span>
    </div>
    {right}
  </div>
);

const mainStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "8",
  flex: "1",
  minWidth: "[0]",
  paddingTop: "12",
  paddingX: "12",
  paddingBottom: "12",
});

/** The form for the open trigger, or for the draft. */
const PanelForm = ({
  page,
  trigger,
  pickFlow = false,
  narrow = false,
}: {
  page: Page;
  trigger: PageTrigger | null;
  pickFlow?: boolean;
  narrow?: boolean;
}) => {
  const kind = trigger?.kind ?? page.draft?.kind;
  if (!kind) {
    return null;
  }
  return (
    <div
      className={
        narrow
          ? css({
              "& [data-trigger-form] > div": {
                gridTemplateColumns: "[112px minmax(0, 1fr)]",
              },
            })
          : undefined
      }
    >
      <TriggerForm
        key={trigger?.id ?? `draft-${kind}`}
        trigger={trigger}
        kind={kind}
        flowId={trigger?.flowId ?? page.draft?.flowId ?? page.flowId}
        flows={page.flows}
        pickFlow={pickFlow}
        onSave={(values) =>
          trigger ? page.saveEdit(trigger.id, values) : page.saveDraft(values)
        }
        onCancel={() => (trigger ? page.open(null) : page.cancelDraft())}
      />
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Take 1 · by flow, side panel
 * ------------------------------------------------------------------------------------------------------------- */

const sectionTitle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
});

const TwoLine = ({ top, bottom }: { top: string; bottom: string }) => (
  <span
    className={css({
      display: "flex",
      flexDirection: "column",
      gap: "0.5",
      flex: "1",
      minWidth: "[0]",
    })}
  >
    <span className={headingText}>{top}</span>
    <span className={mutedText}>{bottom}</span>
  </span>
);

const Take1 = ({ page }: { page: Page }) => {
  const openTrigger = page.triggers.find(
    (trigger) => trigger.id === page.opened,
  );
  const panelFlow = page.flows.find(
    (flow) => flow.id === (openTrigger?.flowId ?? page.draft?.flowId),
  );
  return (
    <div className={css({ display: "flex", minHeight: "[100vh]" })}>
      <main className={mainStyle} data-triggers-content>
        <PageHeader />
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            maxWidth: "[880px]",
          })}
        >
          {page.flows.map((flow, index) => (
            <section
              key={flow.id}
              className={css({
                display: "flex",
                flexDirection: "column",
                paddingY: "5",
                ...(index > 0 ? hairline : {}),
              })}
            >
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  minHeight: "[32px]",
                  paddingBottom: "2",
                })}
              >
                <span className={sectionTitle}>{flow.name}</span>
                <AddMenu
                  onPick={(kind) => page.startDraft({ kind, flowId: flow.id })}
                  trigger={plusButton(`Add a trigger to ${flow.name}`)}
                />
              </div>
              <div
                className={css({
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "3",
                  paddingY: "2",
                })}
              >
                <span className={cx(iconCell, firstLineIconStyle)}>
                  <Icon name="user" size="sm" />
                </span>
                <TwoLine
                  top="Manual runs"
                  bottom="Show a Run button on this flow"
                />
                <ManualSwitch page={page} flow={flow} />
              </div>
              {page.triggers
                .filter((trigger) => trigger.flowId === flow.id)
                .map((trigger) => {
                  const open = page.opened === trigger.id;
                  return (
                    <div
                      key={trigger.id}
                      className={twoLineRowStyle}
                      data-trigger-row={trigger.id}
                      {...rowProps(open, () =>
                        page.open(open ? null : trigger.id),
                      )}
                    >
                      <span className={cx(iconCell, firstLineIconStyle)}>
                        <Icon name={iconFor[trigger.kind]} size="sm" />
                      </span>
                      <TwoLine top={trigger.label} bottom={metaOf(trigger)} />
                      <Status
                        trigger={trigger}
                        on={page.on[trigger.id] ?? false}
                      />
                    </div>
                  );
                })}
              <LockLine count={flow.hidden} />
            </section>
          ))}
        </div>
      </main>
      {openTrigger || page.draft ? (
        <aside
          className={css({
            width: "[420px]",
            flexShrink: 0,
            borderLeftWidth: "thin",
            borderLeftStyle: "solid",
            borderLeftColor: "neutral.bd.subtle",
            backgroundColor: "neutral.bgSolid.min",
          })}
          data-trigger-panel
        >
          <div
            className={css({
              display: "flex",
              alignItems: "flex-start",
              gap: "3",
              padding: "5",
            })}
          >
            <span className={cx(iconCell, firstLineIconStyle)}>
              <Icon
                name={
                  iconFor[openTrigger?.kind ?? page.draft?.kind ?? "schedule"]
                }
                size="sm"
              />
            </span>
            <TwoLine
              top={
                openTrigger?.label ??
                (page.draft?.kind === "responsive"
                  ? "New event trigger"
                  : "New schedule")
              }
              bottom={panelFlow?.name ?? ""}
            />
            {openTrigger ? (
              <span
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "3",
                })}
              >
                <Status
                  trigger={openTrigger}
                  on={page.on[openTrigger.id] ?? false}
                />
                {switchFor(page, openTrigger)}
              </span>
            ) : null}
          </div>
          <div className={css({ ...hairline, paddingX: "5", paddingTop: "2" })}>
            <PanelForm page={page} trigger={openTrigger ?? null} narrow />
          </div>
        </aside>
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Take 2 · one table, inline
 * ------------------------------------------------------------------------------------------------------------- */

const tableStyle = css({
  width: "[100%]",
  borderCollapse: "collapse",
  "& th": {
    height: "[40px]",
    paddingX: "3",
    textAlign: "left",
    textStyle: "sm",
    fontWeight: "normal",
    color: "neutral.fg.subtle",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.bd.subtle",
  },
  "& td": {
    height: "[48px]",
    paddingX: "3",
    textStyle: "sm",
    color: "neutral.fg.heading",
    borderBottomWidth: "thin",
    borderBottomStyle: "solid",
    borderBottomColor: "neutral.bd.subtle",
    whiteSpace: "nowrap",
  },
  "& tr[data-row]": {
    cursor: "pointer",
    _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  },
  "& tr[aria-expanded=true] td": {
    backgroundColor: "neutral.bgSolid.surface",
    borderBottomColor: "[transparent]",
  },
});

type Row =
  | { kind: "manual"; id: string; flow: PageFlow }
  | { kind: "trigger"; id: string; flow: PageFlow; trigger: PageTrigger };

const Take2 = ({
  page,
  routeFlowId,
}: {
  page: Page;
  routeFlowId: string | null;
}) => {
  const [search, setSearch] = useState("");
  const [flowFilter, setFlowFilter] = useState(
    page.flows.some((flow) => flow.id === routeFlowId) && routeFlowId
      ? routeFlowId
      : "all",
  );
  const [webFilter, setWebFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const rows: Row[] = page.flows.flatMap((flow) => [
    { kind: "manual" as const, id: `manual:${flow.id}`, flow },
    ...page.triggers
      .filter((trigger) => trigger.flowId === flow.id)
      .map((trigger) => ({
        kind: "trigger" as const,
        id: trigger.id,
        flow,
        trigger,
      })),
  ]);
  const shown = rows.filter((row) => {
    const label = row.kind === "manual" ? "Manual runs" : row.trigger.label;
    return (
      label.toLowerCase().includes(search.trim().toLowerCase()) &&
      (flowFilter === "all" || row.flow.id === flowFilter) &&
      (webFilter === "all" ||
        (row.kind === "trigger" && row.trigger.web === webFilter)) &&
      (statusFilter === "all" ||
        (statusFilter === "on") === (page.on[row.id] ?? false))
    );
  });
  const hidden = page.flows
    .filter((flow) => flowFilter === "all" || flow.id === flowFilter)
    .reduce((sum, flow) => sum + flow.hidden, 0);
  return (
    <main className={mainStyle} data-triggers-content>
      <PageHeader />
      <div
        className={css({ display: "flex", flexDirection: "column", gap: "4" })}
      >
        <div
          className={css({ display: "flex", alignItems: "center", gap: "2" })}
        >
          <div className={css({ width: "[240px]" })}>
            <TextInput
              size="sm"
              value={search}
              placeholder="Search triggers"
              aria-label="Search triggers"
              prefix={{ iconName: "search", variant: "subtle" }}
              onChange={setSearch}
            />
          </div>
          <div className={css({ width: "[200px]" })}>
            <Select
              required
              size="sm"
              aria-label="Flow"
              items={[
                { value: "all", text: "All flows" },
                ...page.flows.map((flow) => ({
                  value: flow.id,
                  text: flow.name,
                })),
              ]}
              value={flowFilter}
              onChange={(value) => setFlowFilter(value ?? "all")}
            />
          </div>
          <div className={css({ width: "[148px]" })}>
            <Select
              required
              size="sm"
              aria-label="Web"
              items={[
                { value: "all", text: "All webs" },
                ...items(["@aakarsh", "@hash"]),
              ]}
              value={webFilter}
              onChange={(value) => setWebFilter(value ?? "all")}
            />
          </div>
          <SegmentedControl<StatusFilter>
            size="sm"
            aria-label="Status"
            items={[
              { value: "all", label: "All" },
              { value: "on", label: "On" },
              { value: "paused", label: "Paused" },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <span className={css({ flex: "1" })} />
          <AddMenu
            onPick={(kind) =>
              page.startDraft({
                kind,
                flowId: flowFilter === "all" ? page.flowId : flowFilter,
              })
            }
            trigger={
              <Button
                size="sm"
                variant="subtle"
                tone="neutral"
                iconName="plus"
                data-trigger-add
              >
                Add trigger
              </Button>
            }
          />
        </div>
        <table className={tableStyle}>
          <thead>
            <tr>
              <th>Trigger</th>
              <th>Flow</th>
              <th>Web</th>
              <th>Flow version</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {page.draft ? (
              <>
                <tr aria-expanded>
                  <td colSpan={5}>
                    <span
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "3",
                        color: "neutral.fg.muted",
                      })}
                    >
                      <Icon name={iconFor[page.draft.kind]} size="sm" />
                      {page.draft.kind === "schedule"
                        ? "New schedule"
                        : "New event trigger"}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td colSpan={5}>
                    <div className={css({ paddingLeft: "8" })}>
                      <PanelForm page={page} trigger={null} pickFlow />
                    </div>
                  </td>
                </tr>
              </>
            ) : null}
            {shown.map((row) => {
              const open = page.opened === row.id;
              const on = page.on[row.id] ?? false;
              return [
                <tr
                  key={row.id}
                  data-row
                  data-trigger-row={row.id}
                  {...rowProps(open, () => page.open(open ? null : row.id))}
                >
                  <td>
                    <span
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "3",
                      })}
                    >
                      <span className={iconCell}>
                        <Icon
                          name={
                            row.kind === "manual"
                              ? "user"
                              : iconFor[row.trigger.kind]
                          }
                          size="sm"
                        />
                      </span>
                      {row.kind === "manual"
                        ? "Manual runs"
                        : row.trigger.label}
                    </span>
                  </td>
                  <td>{row.flow.name}</td>
                  <td className={css({ color: "neutral.fg.subtle!" })}>
                    {row.kind === "trigger" ? row.trigger.web : ""}
                  </td>
                  <td className={css({ color: "neutral.fg.subtle!" })}>
                    {row.kind === "trigger" ? row.trigger.version : ""}
                  </td>
                  <td>
                    <span
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        gap: "3",
                      })}
                    >
                      {/* A grey word at rest, the switch alone on the opened row (11 Nov convergence A14). */}
                      {open ? null : row.kind === "manual" ? (
                        <span className={subtleText}>{on ? "On" : "Off"}</span>
                      ) : (
                        <Status trigger={row.trigger} on={on} />
                      )}
                      {open ? (
                        row.kind === "manual" ? (
                          // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- keeps the switch's click off the row
                          <span onClick={(event) => event.stopPropagation()}>
                            <Toggle
                              size="sm"
                              aria-label={`Manual runs for ${row.flow.name}`}
                              value={on}
                              onChange={(next) => page.flip(row.id, next)}
                            />
                          </span>
                        ) : (
                          switchFor(page, row.trigger)
                        )
                      ) : null}
                    </span>
                  </td>
                </tr>,
                open && row.kind === "trigger" ? (
                  <tr key={`${row.id}:form`}>
                    <td colSpan={5}>
                      <div className={css({ paddingLeft: "8" })}>
                        <PanelForm page={page} trigger={row.trigger} />
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
        <LockLine count={hidden} />
      </div>
    </main>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Take 3 · pick a flow, edit in place (also the add flow)
 * ------------------------------------------------------------------------------------------------------------- */

const pickerRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  minHeight: "[36px]",
  paddingX: "3",
  borderRadius: "md",
  textAlign: "left",
  cursor: "pointer",
  textStyle: "sm",
  color: "neutral.fg.heading",
  _hover: { backgroundColor: "neutral.bg.subtle.hover" },
  "&[aria-current=true]": { backgroundColor: "neutral.bgSolid.surface" },
});

const Take3 = ({ page }: { page: Page }) => {
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (page.add !== 1) {
      return;
    }
    const timer = setTimeout(() => press("[data-trigger-add]"), 400);
    return () => clearTimeout(timer);
  }, [page.add]);
  const flow =
    page.flows.find((candidate) => candidate.id === page.flowId) ??
    page.flows[0]!;
  const own = page.triggers.filter((trigger) => trigger.flowId === flow.id);
  const shown = own.filter((trigger) =>
    trigger.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const draft = page.draft?.flowId === flow.id ? page.draft : null;
  return (
    <main className={mainStyle} data-triggers-content>
      <PageHeader />
      <div
        className={css({
          display: "flex",
          gap: "12",
          alignItems: "flex-start",
        })}
      >
        <nav
          aria-label="Flows"
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "0.5",
            width: "[240px]",
            flexShrink: 0,
          })}
        >
          <span
            className={cx(subtleText, css({ paddingX: "3", paddingY: "2" }))}
          >
            Flows
          </span>
          {page.flows.map((candidate) => {
            const triggers = page.triggers.filter(
              (trigger) => trigger.flowId === candidate.id,
            );
            return (
              <button
                key={candidate.id}
                type="button"
                className={pickerRowStyle}
                aria-current={candidate.id === flow.id}
                onClick={() => page.setFlowId(candidate.id)}
              >
                <span className={css({ flex: "1" })}>{candidate.name}</span>
                {triggers.some((trigger) => trigger.failed) ? (
                  <FailedDot />
                ) : null}
                <span className={subtleText}>{triggers.length}</span>
              </button>
            );
          })}
        </nav>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            flex: "1",
            minWidth: "[0]",
            maxWidth: "[880px]",
          })}
        >
          <div className={css({ paddingBottom: "4" })}>
            <TwoLine top={flow.name} bottom="What can start this flow" />
          </div>
          <div
            className={css({
              ...hairline,
              display: "flex",
              alignItems: "center",
              gap: "3",
              paddingY: "4",
            })}
          >
            <TwoLine
              top="Manual runs"
              bottom="Show a Run button on this flow"
            />
            <ManualSwitch page={page} flow={flow} />
          </div>
          <div
            className={css({
              ...hairline,
              display: "flex",
              flexDirection: "column",
              paddingTop: "3",
            })}
          >
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "1",
                minHeight: "[32px]",
              })}
            >
              <span className={cx(sectionTitle, css({ flex: "1" }))}>
                Triggers · {own.length}
              </span>
              <Button
                size="xs"
                variant="ghost"
                tone="neutral"
                iconName="search"
                aria-label="Search triggers"
                onClick={() => {
                  setSearching(!searching);
                  setSearch("");
                }}
              />
              <AddMenu
                onPick={(kind) => page.startDraft({ kind, flowId: flow.id })}
                trigger={plusButton("Add a trigger")}
              />
            </div>
            {searching ? (
              <TextInput
                size="sm"
                value={search}
                placeholder="Search triggers"
                aria-label="Search triggers"
                onChange={setSearch}
              />
            ) : null}
            {groups.map((group) => {
              const rows = shown.filter(
                (trigger) => trigger.kind === group.kind,
              );
              const drafting = draft?.kind === group.kind;
              if (rows.length === 0 && !drafting) {
                return null;
              }
              return (
                <div
                  key={group.kind}
                  className={css({ display: "flex", flexDirection: "column" })}
                >
                  <span className={cx(subtleText, css({ paddingY: "2" }))}>
                    {group.label}
                  </span>
                  {rows.map((trigger) => {
                    const open = page.opened === trigger.id;
                    return (
                      <div key={trigger.id} data-trigger-row={trigger.id}>
                        <div
                          className={rowStyle}
                          {...rowProps(open, () =>
                            page.open(open ? null : trigger.id),
                          )}
                        >
                          <span className={iconCell}>
                            <Icon name={iconFor[trigger.kind]} size="sm" />
                          </span>
                          <span className={css({ flex: "1" })}>
                            {trigger.label}
                          </span>
                          <span className={subtleText}>{metaOf(trigger)}</span>
                          <span
                            className={css({
                              display: "flex",
                              justifyContent: "flex-end",
                              minWidth: "[88px]",
                            })}
                          >
                            {open ? (
                              switchFor(page, trigger)
                            ) : (
                              <Status
                                trigger={trigger}
                                on={page.on[trigger.id] ?? false}
                              />
                            )}
                          </span>
                        </div>
                        {open ? (
                          <div className={css({ paddingLeft: "7" })}>
                            <PanelForm page={page} trigger={trigger} />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {drafting ? (
                    <div data-trigger-row="new">
                      <div className={rowStyle} aria-expanded>
                        <span className={iconCell}>
                          <Icon name={iconFor[group.kind]} size="sm" />
                        </span>
                        <span
                          className={css({
                            flex: "1",
                            color: "neutral.fg.muted",
                          })}
                        >
                          {group.kind === "schedule"
                            ? "New schedule"
                            : "New event trigger"}
                        </span>
                      </div>
                      <div className={css({ paddingLeft: "7" })}>
                        <PanelForm page={page} trigger={null} />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {own.length === 0 && !draft ? (
              <span className={cx(subtleText, css({ paddingY: "2" }))}>
                No schedules or responsive triggers yet
              </span>
            ) : null}
            <LockLine count={flow.hidden} />
          </div>
        </div>
      </div>
    </main>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Take 4 · flat list, own page
 * ------------------------------------------------------------------------------------------------------------- */

const Take4 = ({ page }: { page: Page }) => {
  const [search, setSearch] = useState("");
  const openTrigger = page.triggers.find(
    (trigger) => trigger.id === page.opened,
  );
  const manualFlow = page.flows.find(
    (flow) => `manual:${flow.id}` === page.opened,
  );
  if (manualFlow) {
    return (
      <main className={mainStyle} data-triggers-content>
        <BreadCrumbs size="md" aria-label="Trigger">
          <BreadCrumbs.Item onClick={() => navigate("/flows")} noCollapse>
            Flows
          </BreadCrumbs.Item>
          <BreadCrumbs.Item onClick={() => page.open(null)} noCollapse>
            Triggers
          </BreadCrumbs.Item>
          <BreadCrumbs.Item noCollapse>Manual runs</BreadCrumbs.Item>
        </BreadCrumbs>
        <div
          className={css({
            display: "flex",
            alignItems: "flex-start",
            gap: "3",
            maxWidth: "[880px]",
          })}
        >
          <span className={cx(iconCell, firstLineIconStyle)}>
            <Icon name="user" size="sm" />
          </span>
          <TwoLine
            top="Manual runs"
            bottom={`${manualFlow.name} · Show a Run button on this flow`}
          />
          <ManualSwitch page={page} flow={manualFlow} />
        </div>
      </main>
    );
  }
  if (openTrigger || page.draft) {
    const flow = page.flows.find(
      (candidate) =>
        candidate.id === (openTrigger?.flowId ?? page.draft?.flowId),
    );
    const title =
      openTrigger?.label ??
      (page.draft?.kind === "responsive"
        ? "New event trigger"
        : "New schedule");
    return (
      <main className={mainStyle} data-triggers-content>
        <BreadCrumbs size="md" aria-label="Trigger">
          <BreadCrumbs.Item onClick={() => navigate("/flows")} noCollapse>
            Flows
          </BreadCrumbs.Item>
          <BreadCrumbs.Item
            onClick={() => {
              page.open(null);
              page.cancelDraft();
            }}
            noCollapse
          >
            Triggers
          </BreadCrumbs.Item>
          <BreadCrumbs.Item noCollapse>{title}</BreadCrumbs.Item>
        </BreadCrumbs>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            maxWidth: "[880px]",
          })}
        >
          <div
            className={css({
              display: "flex",
              alignItems: "flex-start",
              gap: "3",
              paddingBottom: "5",
            })}
          >
            <span className={cx(iconCell, firstLineIconStyle)}>
              <Icon
                name={
                  iconFor[openTrigger?.kind ?? page.draft?.kind ?? "schedule"]
                }
                size="sm"
              />
            </span>
            <TwoLine
              top={title}
              bottom={openTrigger ? (flow?.name ?? "") : "Pick its flow below"}
            />
            {openTrigger ? (
              <span
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "3",
                })}
              >
                <Status
                  trigger={openTrigger}
                  on={page.on[openTrigger.id] ?? false}
                />
                {switchFor(page, openTrigger)}
              </span>
            ) : null}
          </div>
          <div className={css({ ...hairline, paddingTop: "3" })}>
            <PanelForm page={page} trigger={openTrigger ?? null} pickFlow />
          </div>
        </div>
      </main>
    );
  }
  const rows = page.flows.flatMap((flow) => [
    { id: `manual:${flow.id}`, flow, trigger: null },
    ...page.triggers
      .filter((trigger) => trigger.flowId === flow.id)
      .map((trigger) => ({ id: trigger.id, flow, trigger })),
  ]);
  const shown = rows.filter((row) =>
    (row.trigger?.label ?? "Manual runs")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const hidden = page.flows.reduce((sum, flow) => sum + flow.hidden, 0);
  return (
    <main className={mainStyle} data-triggers-content>
      <PageHeader />
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "4",
          maxWidth: "[880px]",
        })}
      >
        <TextInput
          size="sm"
          value={search}
          placeholder="Search triggers"
          aria-label="Search triggers"
          prefix={{ iconName: "search", variant: "subtle" }}
          onChange={setSearch}
        />
        <div className={css({ display: "flex", flexDirection: "column" })}>
          {shown.map((row) => {
            const on = page.on[row.id] ?? false;
            if (!row.trigger) {
              return (
                <div
                  key={row.id}
                  className={twoLineRowStyle}
                  data-trigger-row={row.id}
                  {...rowProps(false, () => page.open(row.id))}
                >
                  <span className={cx(iconCell, firstLineIconStyle)}>
                    <Icon name="user" size="sm" />
                  </span>
                  <TwoLine
                    top="Manual runs"
                    bottom={`${row.flow.name} · Run button`}
                  />
                  <span className={subtleText}>{on ? "On" : "Off"}</span>
                </div>
              );
            }
            const trigger = row.trigger;
            return (
              <div
                key={row.id}
                className={twoLineRowStyle}
                data-trigger-row={row.id}
                {...rowProps(false, () => page.open(trigger.id))}
              >
                <span className={cx(iconCell, firstLineIconStyle)}>
                  <Icon name={iconFor[trigger.kind]} size="sm" />
                </span>
                <TwoLine
                  top={trigger.label}
                  bottom={`${row.flow.name} · ${metaOf(trigger)}`}
                />
                <Status trigger={trigger} on={on} />
              </div>
            );
          })}
          <LockLine count={hidden} />
        </div>
        <div className={css({ ...hairline, paddingTop: "3" })}>
          <AddMenu
            onPick={(kind) => page.startDraft({ kind, flowId: page.flowId })}
            trigger={
              <Button
                size="sm"
                variant="ghost"
                tone="neutral"
                iconName="plus"
                data-trigger-add
              >
                Add trigger
              </Button>
            }
          />
        </div>
      </div>
    </main>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * The page
 * ------------------------------------------------------------------------------------------------------------- */

/** The page behind `?triggerspage=` or `?triggeradd=`; the add flow is always on take 3. */
export const TriggersPage = ({ flowId }: { flowId: string | null }) => {
  const page = usePage(flowId);
  const take = page.add ? 3 : (triggersPageTake() ?? 3);
  // Menus, selects and the confirm portal in here, inside the shell's styles.
  const portalRef = useRef<HTMLDivElement>(null);
  return (
    <HashShell>
      <PortalContainerContext value={portalRef}>
        <div ref={portalRef} className={css({ position: "relative" })}>
          {take === 1 ? (
            <Take1 page={page} />
          ) : take === 2 ? (
            <Take2 page={page} routeFlowId={flowId} />
          ) : take === 4 ? (
            <Take4 page={page} />
          ) : (
            <Take3 page={page} />
          )}
        </div>
      </PortalContainerContext>
    </HashShell>
  );
};
