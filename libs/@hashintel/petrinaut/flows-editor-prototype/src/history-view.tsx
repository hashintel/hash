/**
 * History for a flow with runs (J6, 4 Nov design sync): a run opens on the editor canvas, read-only, with every
 * step's state; the left panel lists the steps with their counts; the top bar switches runs with arrows and a
 * dropdown, and All runs goes back to the list. Run 17 runs live; Runs 12–16 are past runs (`run-history.ts`).
 */
import { createContext, use, useEffect, useState } from "react";

import {
  Button,
  type ChipColor,
  type IconName,
  Menu,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { runIdMono, runIdStyled, RunIdText, runLabel } from "./run-id";
import { runIdCopyTake } from "./run-id-mono";
import { runsOf, startRun, stopRun, useAppState } from "./app-store";
import { getCatalogEntry } from "./catalog";
import { flattenSteps, START_ID, stepLabel } from "./document";
import { type EditorUi, useEditor } from "./editor-context";
import { navigate, routePath } from "./router";
import { RunGlyph } from "./run-glyph";
import { runOutputs, StepOutputs } from "./run-outputs";
import { ForEachItems, StepStatusLines } from "./run-step-status";
import type { StepState } from "./run-history";
import {
  anyTicking,
  clockPlus,
  factsOf,
  findSpan,
  forEachId,
  statusText,
  outcomeOf,
  outcomeState,
  runProgress,
  type RunFacts,
  type RunRecord,
  signOffAt,
  signOffId,
  stageSpan,
  type StepRun,
  stepRuns,
  runTriggerId,
  triggerLabel,
} from "./run-history";
import { openFlowTriggers } from "./flow-triggers";
import { triggerFiredTake } from "./trigger-flags";
import {
  HeaderTitle,
  HueHeader,
  kindGroupOf,
  oldPanelHeader,
  panelKindTake,
  PropertyRow,
  Section,
} from "./ui";

/* ----------------------------------------------------------------------------------------------------------------
 * State: the flow's runs and the clock that moves the live ones
 * ------------------------------------------------------------------------------------------------------------- */

export type HistoryValue = {
  runs: RunRecord[];
  now: number;
  /** The run on the canvas, or null on All runs. */
  run: RunRecord | null;
  /** Each step's state in that run. */
  steps: Record<string, StepRun> | null;
  open: (id: number | null) => void;
  /** Run, or a banner's Re-run: a new live run, opened. */
  start: (items?: number) => void;
  stop: (id: number) => void;
};

export const HistoryContext = createContext<HistoryValue | null>(null);

/** The open run's view, or null outside History (the canvas and panels draw the editor). */
export const useRunView = () => {
  const history = use(HistoryContext);
  const { ui } = useEditor();
  return ui.history && history?.run ? history : null;
};

const tickMs = 250;

/**
 * A flow's runs from the app store, and the clock that moves the live ones. Which run is open comes from the URL
 * (`/flows/:flowId/history`, `/flows/:flowId/runs/:runId`); opening one navigates.
 */
export const useHistory = (
  flowId: string | undefined,
  opened: EditorUi["history"],
  setUi: (update: (ui: EditorUi) => EditorUi) => void,
): HistoryValue | null => {
  const appState = useAppState();
  const runs = flowId ? runsOf(appState, flowId) : [];
  const [now, setNow] = useState(() => Date.now());
  const ticking = anyTicking(runs);
  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [ticking]);

  if (!flowId) {
    return null;
  }
  const open = (id: number | null) => {
    setUi((current) => ({
      ...current,
      selectedId: null,
      selectedIds: [],
      picker: null,
      openField: null,
      canvasMenu: null,
      viewRunId: null,
      run: false,
    }));
    navigate(
      routePath(
        id === null
          ? { page: "history", flowId }
          : { page: "run", flowId, runId: id },
      ),
    );
  };
  const run =
    opened?.runId == null
      ? null
      : (runs.find((candidate) => candidate.id === opened.runId) ?? null);
  return {
    runs,
    now,
    run,
    steps: run ? stepRuns(factsOf(run, now)) : null,
    open,
    start: (items) => {
      const id = startRun(flowId, items);
      setNow(Date.now());
      open(id);
    },
    stop: (id) => stopRun(flowId, id),
  };
};

/** The history's newest-first order: ← goes to an older run, → to a newer one. */
const neighbour = (history: HistoryValue, by: -1 | 1) => {
  const index = history.runs.findIndex(
    (candidate) => candidate.id === history.run?.id,
  );
  return index < 0 ? undefined : history.runs[index - by];
};

/** ↑ ↓ switch runs. Esc is not here: it only clears a selected step (`useEscapeClearsSelection`); All runs is the breadcrumb. */
export const useRunKeys = (history: HistoryValue | null, active: boolean) => {
  useEffect(() => {
    if (!active || !history) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, [contenteditable], [role=menu]") ||
        globalThis.document.querySelector("[role=menu], [role=dialog]")
      ) {
        return;
      }
      const next =
        event.key === "ArrowUp"
          ? neighbour(history, 1)
          : event.key === "ArrowDown"
            ? neighbour(history, -1)
            : undefined;
      if (next) {
        event.preventDefault();
        history.open(next.id);
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [history, active]);
};

/* ----------------------------------------------------------------------------------------------------------------
 * Top bar: All runs, then the run switcher after the title
 * ------------------------------------------------------------------------------------------------------------- */

/**
 * `?rundropdown=dark` (6 Nov sync): the open run has no tick, only the DS selected fill, so the menu shows one mark
 * per row. URL only, never remembered; unset keeps the tick.
 */
const runDropdownDark = () =>
  new URLSearchParams(globalThis.location.search).get("rundropdown") ===
  "dark";

const runMenuLabel = (run: RunRecord, now: number) => {
  const outcome = outcomeOf(run, now);
  const timedOut =
    run.kind === "past" && run.facts.signOff === "timedOut"
      ? " · timed out"
      : "";
  return `${runLabel(run)} · ${statusText(run, now)}${outcome === "error" ? timedOut : ""}`;
};

const menuRowStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
  "& > span": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const menuTimeStyle = css({
  textStyle: "xs",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
});

const runArrowStyle = css({
  "&[class]": {
    width: "[28px]",
    minWidth: "[28px]",
    height: "[28px]",
    padding: "[0]",
  },
});

const runPickerStyle = css({
  "&[class]": {
    fontWeight: "medium",
    color: "neutral.fg.heading",
    paddingX: "1.5",
  },
});

/** ‹ older run, the run picker (a DS Menu), › newer run (off on the newest). */
export const RunSwitcher = ({
  history,
  arrows = true,
  picker = true,
  bordered = false,
  withTime = false,
  allRunsFirst = false,
  trigger,
}: {
  history: HistoryValue;
  /** ‹ › beside the picker. */
  arrows?: boolean;
  /** The picker itself (off for top bar 2's arrows, whose picker sits in its one control). */
  picker?: boolean;
  /** The picker in a hairline box (Figma 1172:586), not a ghost button. */
  bordered?: boolean;
  /** "Run 16 · Today, 08:15" on the picker, not "Run 16". */
  withTime?: boolean;
  /** All runs heads the menu (top bar 2: the picker is the only way to the list). */
  allRunsFirst?: boolean;
  /** A picker of its own (top bar 2's compound control); it gets `data-run-picker`. */
  trigger?: React.ReactElement;
}) => {
  const { run, runs, now } = history;
  if (!run) {
    return null;
  }
  const runsGroup = {
    id: "runs",
    label: "Runs · newest first",
    // The six newest, as J6.8 lists them, and the open run if it is older.
    items: runs
      .filter((candidate, index) => index < 6 || candidate.id === run.id)
      .map((candidate) => ({
        id: `run-${candidate.id}`,
        text: (
          <span className={menuRowStyle}>
            <RunGlyph
              state={outcomeState[outcomeOf(candidate, now)]}
              progress={runProgress(candidate, now)}
              warnings={outcomeOf(candidate, now) === "warnings"}
              size={14}
            />
            <span>
              {runIdStyled() ? (
                <>
                  <RunIdText run={candidate} prefix copyable={runIdCopyTake() !== null} />
                  {runMenuLabel(candidate, now).slice(runLabel(candidate).length)}
                </>
              ) : (
                runMenuLabel(candidate, now)
              )}
            </span>
          </span>
        ),
        suffix: <span className={menuTimeStyle}>{candidate.when}</span>,
        selected: candidate.id === run.id,
        selectedStyle: runDropdownDark()
          ? ("highlight" as const)
          : ("tick" as const),
        onClick: () => history.open(candidate.id),
      })),
  };
  const allRunsGroup = {
    id: "all",
    label: "",
    items: [
      {
        id: "all-runs",
        text: "All runs",
        icon: "list" as const,
        onClick: () => history.open(null),
      },
    ],
  };
  const older = neighbour(history, -1);
  const newer = neighbour(history, 1);
  return (
    <div className={css({ display: "flex", alignItems: "center", gap: "0.5" })}>
      {arrows ? (
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          iconName="chevronLeft"
          className={runArrowStyle}
          aria-label="Older run"
          tooltip="Older run"
          disabled={!older}
          onClick={() => older && history.open(older.id)}
        />
      ) : null}
      {picker ? (
        <Menu
          position="bottom-start"
          className={css({ width: "[320px]" })}
          items={
            allRunsFirst ? [allRunsGroup, runsGroup] : [runsGroup, allRunsGroup]
          }
          trigger={
            trigger ?? (
              <Button
                size="sm"
                variant={bordered ? "subtle" : "ghost"}
                tone="neutral"
                iconName="chevronDown"
                iconPosition="right"
                className={runPickerStyle}
                tooltip={withTime ? undefined : run.when}
                data-run-picker
              >
                {runIdStyled() ? (
                  <>
                    <RunIdText run={run} prefix />
                    {withTime ? ` · ${run.when}` : null}
                  </>
                ) : withTime ? (
                  `${runLabel(run)} · ${run.when}`
                ) : (
                  `${runLabel(run)}`
                )}
              </Button>
            )
          }
        />
      ) : null}
      {arrows ? (
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          iconName="chevronRight"
          className={runArrowStyle}
          aria-label="Newer run"
          tooltip="Newer run"
          disabled={!newer}
          onClick={() => newer && history.open(newer.id)}
        />
      ) : null}
    </div>
  );
};

/* ----------------------------------------------------------------------------------------------------------------
 * Canvas banner
 * ------------------------------------------------------------------------------------------------------------- */

/* ----------------------------------------------------------------------------------------------------------------
 * Right panel: a step in a run (J6.7)
 * ------------------------------------------------------------------------------------------------------------- */

const runPanelStyle = css({
  position: "relative",
  flexShrink: 0,
  width: "[384px]",
  height: "[100%]",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  // Attio-like room (4 Nov: "cramped"): 24 px in from the edges, 32 px between sections.
  gap: "8",
  padding: "6",
  backgroundColor: "neutral.bgSolid.min",
  borderLeftWidth: "thin",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.solid",
  zIndex: "[5]",
});

const strongLineStyle = css({
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
});

/** H4's second line, "Action · description": 14 px on the title's 20 px line, muted as in the editor. */
const headerLineStyle = css({
  textStyle: "sm",
  color: "neutral.fg.muted.hover",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const valueStyle = css({
  textStyle: "sm",
  color: "neutral.fg.body",
  overflowWrap: "anywhere",
});

type Detail = {
  type: string;
  icon: IconName;
  chips: { label: string; color: ChipColor }[];
  span?: string;
  inputs: [string, string][];
};

/** `?triggerfired=3`: the fired trigger, selected, and the panel tells who or what started the run. */
const FiredTriggerPanel = ({ run }: { run: RunRecord }) => {
  const { document } = useEditor();
  const manual = run.trigger.kind === "manual";
  const rows: [string, string][] = manual
    ? [
        ["Started by", run.trigger.by],
        ["When", run.when],
        ["From", "Run button in the editor"],
        ["Web", "@hash"],
      ]
    : [
        ["Schedule", "1st of every month at 09:00"],
        ["When", run.when],
        ["Web", "@aakarsh"],
        ["Created by", "Dora"],
      ];
  return (
    <aside className={runPanelStyle} aria-label="Trigger in this run">
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "0.5",
        })}
      >
        <HeaderTitle icon={manual ? "user" : "calendarClock"}>
          <span className={strongLineStyle}>
            {manual ? "Manual run" : "Schedule"}
          </span>
        </HeaderTitle>
        <span
          className={css({
            textStyle: "sm",
            color: "neutral.fg.muted",
            paddingLeft: "6",
          })}
        >
          Started {runIdMono() ? <RunIdText run={run} prefix /> : runLabel(run)}
        </span>
      </div>
      <Section title="Trigger">
        {rows.map(([key, value]) => (
          <PropertyRow key={key} label={key}>
            <span className={valueStyle}>{value}</span>
          </PropertyRow>
        ))}
        <span className={css({ gridColumn: "1 / -1", paddingTop: "1" })}>
          <button
            type="button"
            className={css({
              textStyle: "sm",
              color: "neutral.fg.muted",
              textDecoration: "underline",
              cursor: "pointer",
            })}
            onClick={() => openFlowTriggers(document.name)}
          >
            Edit flow triggers
          </button>
        </span>
      </Section>
    </aside>
  );
};

/** The status mark for a chip: the F3 glyph beside the label, in place of a coloured pill. */
const chipState = (chip: Detail["chips"][number]): StepState => {
  switch (chip.color) {
    case "blue":
      return "running";
    case "orange":
      return "needsReview";
    case "red":
      return "failed";
    case "green":
      return "done";
    default:
      return chip.label === "Abandoned"
        ? "abandoned"
        : chip.label === "Skipped"
          ? "skipped"
          : "notReached";
  }
};

const statusMarkStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  height: "[24px]",
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.fg.body",
});

const chipsFor = (state: StepRun, done: string): Detail["chips"] => {
  switch (state.state) {
    case "running":
      return [{ label: "Running", color: "blue" }];
    case "needsReview":
      return [{ label: "Needs review", color: "orange" }];
    case "failed":
      return [{ label: state.count ?? "Failed", color: "red" }];
    case "abandoned":
      return [{ label: "Abandoned", color: "grey" }];
    case "notReached":
      return [{ label: "Not reached", color: "grey" }];
    case "skipped":
      return [{ label: "Skipped", color: "grey" }];
    default:
      return [{ label: done, color: "green" }];
  }
};

const spanLine = (run: RunRecord, from: number, to: number, what: string) =>
  `${clockPlus(run.startClock, from)} – ${clockPlus(run.startClock, to)}${what ? ` · ${what}` : ""}`;

const detailOf = (
  stepId: string,
  run: RunRecord,
  facts: RunFacts,
  state: StepRun,
): Detail => {
  const { n } = facts;
  const failed = facts.failures.length;
  const span = stageSpan(stepId, n);
  const reached = state.state !== "notReached";
  if (stepId === runTriggerId) {
    const label = triggerLabel(run);
    return {
      type: label.title,
      icon: run.trigger.kind === "manual" ? "user" : "calendarClock",
      chips: [{ label: "Started the run", color: "green" }],
      span: run.startClock,
      inputs: [["Started by", label.line]],
    };
  }
  if (stepId === START_ID) {
    return {
      type: "Start",
      icon: "play",
      chips: [{ label: "Done", color: "green" }],
      span: run.startClock,
      inputs: [["Review month", "November 2026"]],
    };
  }
  if (stepId === "findSuppliers") {
    return {
      type: "Find entities",
      icon: "search",
      chips: chipsFor(state, `${n} found`),
      span: spanLine(run, findSpan.from, findSpan.to, ""),
      inputs: [
        ["Entity type", "Supplier"],
        ["Filter", "Status is Active"],
      ],
    };
  }
  if (stepId === forEachId) {
    return {
      type: "For each",
      icon: "rotate",
      chips:
        state.state === "doneWithFailures"
          ? [
              { label: `${n - failed} done`, color: "green" },
              { label: `${failed} failed`, color: "red" },
            ]
          : chipsFor(state, `${n} done`),
      span: reached
        ? spanLine(run, findSpan.to, signOffAt(n), `${n} suppliers`)
        : undefined,
      inputs: [["List", "Find active suppliers › Entities"]],
    };
  }
  if (stepId === signOffId) {
    return {
      type: "Ask a person",
      icon: "user",
      chips:
        state.state === "done"
          ? [{ label: "Approved", color: "green" }]
          : state.state === "failed"
            ? [{ label: "Timed out after 48 h", color: "red" }]
            : chipsFor(state, ""),
      span: reached
        ? `From ${clockPlus(run.startClock, signOffAt(n))}`
        : undefined,
      inputs: [
        ["Person", "Head of quality"],
        ["Question", "Sign off this month's supplier review?"],
      ],
    };
  }
  const titles: Record<string, [string, IconName, string, [string, string][]]> =
    {
      readName: ["Read entity", "eye", "read", [["Property", "Name"]]],
      readEmail: [
        "Read entity",
        "eye",
        "read",
        [["Property", "Contact email"]],
      ],
      readCertificateLink: [
        "Read entity",
        "eye",
        "read",
        [["Property", "Certificate link"]],
      ],
      fetchCertificate: [
        "Fetch file",
        "download",
        "fetched",
        [["File URL", "Read certificate link › URL"]],
      ],
      sendReviewEmail: [
        "Send email",
        "at",
        "sent",
        [
          ["To", "Read contact email › Value"],
          ["Subject", "Your monthly quality review"],
        ],
      ],
      markReviewed: [
        "Update entity",
        "pencil",
        "updated",
        [["Last reviewed", "Start › Review month"]],
      ],
    };
  const [type, icon, verb, inputs] = titles[stepId] ?? [
    "Step",
    "cube" as const,
    "done",
    [],
  ];
  const done =
    state.bar?.find((segment) => segment.state === "done")?.count ?? 0;
  const misses =
    state.bar?.find((segment) => segment.state === "failed")?.count ?? 0;
  const skipped =
    state.bar?.find((segment) => segment.state === "skipped")?.count ?? 0;
  const chips: Detail["chips"] = [
    { label: `${done} ${verb}`, color: "green" },
    ...(misses > 0
      ? [{ label: `${misses} failed`, color: "red" as const }]
      : []),
    ...(skipped > 0
      ? [{ label: `${skipped} skipped`, color: "grey" as const }]
      : []),
    ...(state.state === "running"
      ? [{ label: "Running", color: "blue" as const }]
      : []),
    ...(state.state === "abandoned"
      ? [{ label: "Abandoned", color: "grey" as const }]
      : []),
  ];
  return {
    type,
    icon,
    chips: reached ? chips : chipsFor(state, ""),
    span:
      span && reached
        ? stepId === "fetchCertificate" && run.id === 16
          ? `08:15:22 – 08:16:40 · ${n} suppliers`
          : spanLine(run, span.from, span.to, `${n} suppliers`)
        : undefined,
    inputs: stepId.startsWith("read")
      ? [["Entity", "For each supplier › Item"], ...inputs]
      : inputs,
  };
};

/** Steps whose outputs open a viewer (`run-outputs.tsx`); the rest are simple values, inline. */
const viewerSteps = new Set([
  "findSuppliers",
  forEachId,
  "readName",
  "readEmail",
  "readCertificateLink",
  "fetchCertificate",
  "sendReviewEmail",
  "markReviewed",
]);

const hasViewer = (stepId: string) => viewerSteps.has(stepId);

/** Simple outputs need no detail view (Ciarán, 26 Oct): the sign-off's Decision. */
const plainOutputs = (stepId: string, state: StepRun): [string, string][] =>
  stepId === signOffId
    ? state.state === "done"
      ? [["Decision", "Approved"]]
      : state.state === "failed"
        ? [["Decision", "None · nobody answered in 48 h"]]
        : []
    : [];

/**
 * The run panel's H4 header. `?panelkind=k2..k4` (inbox panel-header-kind) as in the editor; with no description,
 * k2 shows the type alone, k3 the group word alone, k4 the type over the group word.
 */
const RunHeader = ({
  icon,
  kind,
  group,
  description,
  today,
}: {
  icon: IconName;
  kind: string;
  group?: string;
  description: string;
  today: string;
}) => {
  const described = description.trim() ? description : "";
  const second =
    panelKindTake === "k1"
      ? today
      : panelKindTake === "k2"
        ? described
        : panelKindTake === "k3"
          ? [group, described].filter(Boolean).join(" · ")
          : described
            ? kind
            : (group ?? "");
  return (
    <HueHeader
      icon={icon}
      title={
        <span>{panelKindTake === "k4" && described ? described : kind}</span>
      }
    >
      {second ? <span className={headerLineStyle}>{second}</span> : null}
    </HueHeader>
  );
};

export const RunStepPanel = ({ history }: { history: HistoryValue }) => {
  const { document, ui } = useEditor();
  const { run, steps, now } = history;
  const stepId = ui.selectedId;
  if (!run || !steps || !stepId) {
    return null;
  }
  const state = steps[stepId] ?? { state: "notReached" as const };
  const facts = factsOf(run, now);
  const detail = detailOf(stepId, run, facts, state);
  const step = flattenSteps(document.steps).find(
    (candidate) => candidate.step.stepId === stepId,
  )?.step;
  const label =
    stepId === runTriggerId
      ? triggerLabel(run).line
      : stepId === START_ID
        ? "Review month"
        : step
          ? stepLabel(step)
          : "";
  const entry =
    step?.kind === "action"
      ? getCatalogEntry(step.actionDefinitionId)
      : undefined;
  const outputs = plainOutputs(stepId, state);
  if (triggerFiredTake === 3 && stepId === runTriggerId) {
    return <FiredTriggerPanel run={run} />;
  }
  return (
    <aside className={runPanelStyle} aria-label="Step in this run">
      {oldPanelHeader ? (
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "0.5",
          })}
        >
          <HeaderTitle icon={entry?.icon ?? detail.icon}>
            <span className={strongLineStyle}>
              {entry?.title ?? detail.type}
            </span>
          </HeaderTitle>
          <span
            className={css({
              textStyle: "sm",
              color: "neutral.fg.muted",
              paddingLeft: "6",
            })}
          >
            {label}
          </span>
        </div>
      ) : (
        <RunHeader
          icon={entry?.icon ?? detail.icon}
          kind={entry?.title ?? detail.type}
          group={
            stepId === runTriggerId
              ? "Trigger"
              : kindGroupOf(entry?.icon ?? detail.icon)
          }
          description={
            stepId === runTriggerId
              ? (document.triggers.find(
                  (trigger) => trigger.kind === run.trigger.kind,
                )?.description ?? "")
              : (step?.description ?? "")
          }
          today={
            step?.kind === "action" && step.description.trim()
              ? `Action · ${step.description}`
              : label
          }
        />
      )}
      <Section title="Status">
        <div
          className={css({
            gridColumn: "1 / -1",
            display: "flex",
            flexDirection: "column",
            gap: "1.5",
          })}
        >
          <span
            className={css({ display: "flex", gap: "1", flexWrap: "wrap" })}
          >
            {detail.chips.map((chip) => (
              <span key={chip.label} className={statusMarkStyle}>
                <RunGlyph state={chipState(chip)} size={16} />
                {chip.label}
              </span>
            ))}
          </span>
          {/* The step's own facts (Run outputs playground, 5 Nov): "12 s · 5 Nov, 14:02", then attempts or waiting only when they apply. */}
          <StepStatusLines
            stepId={stepId}
            run={run}
            facts={facts}
            state={state}
            now={now}
          />
        </div>
      </Section>
      {stepId === forEachId && state.state !== "notReached" ? (
        <Section title="Items">
          <ForEachItems facts={facts} />
        </Section>
      ) : null}
      {detail.inputs.length > 0 ? (
        <Section title="Inputs">
          {detail.inputs.map(([key, value]) => (
            <PropertyRow key={key} label={key}>
              <span className={valueStyle}>{value}</span>
            </PropertyRow>
          ))}
        </Section>
      ) : null}
      {state.state === "notReached" ? null : hasViewer(stepId) ? (
        // Each output opens what it produced (4 Nov, Dora [29:11]–[35:49]); the take is ?stepoutputs=a..d.
        <Section title="Outputs">
          <div className={css({ gridColumn: "1 / -1" })}>
            <StepOutputs stepId={stepId} outputs={runOutputs(run, now)} />
          </div>
        </Section>
      ) : outputs.length > 0 ? (
        <Section title="Outputs">
          {outputs.map(([key, value]) => (
            <PropertyRow key={key} label={key}>
              <span className={valueStyle}>{value}</span>
            </PropertyRow>
          ))}
        </Section>
      ) : null}
    </aside>
  );
};
