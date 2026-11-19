import { useEffect, useMemo, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";

import { getStepName } from "../shared/find-step";
import { useItemNames } from "../shared/item-name";
import { getNameLabel, getOutputLabel } from "../shared/name-label";
import { RunGlyph } from "../shared/run-marks";
import { PanelSection, PanelTitle, SidePanel } from "../shared/side-panel";
import { getActionDefinition, getStepDisplay } from "../shared/step-display";
import { StepIconTile } from "../shared/step-icon-tile";
import { ValueName } from "../shared/value-name";
import { indexValueUses } from "../shared/value-uses";
import { getPayloadShape, getValueDisplay } from "./shared/run-value-display";
import { OutputUses } from "./step-run-panel/output-uses";
import { RunValue } from "./step-run-panel/run-value";
import { getItemTotal, getStatusLine } from "./step-run-panel/status-lines";
import { StepRunError } from "./step-run-panel/step-run-error";
import {
  getCommonInputs,
  getLastError,
  getRunsOfStep,
  sortInputs,
} from "./step-run-panel/step-runs";

import type { StepRunMark } from "../shared/step-states";
import type { ValueUse } from "../shared/value-uses";
import type { ValueDisplay } from "./shared/run-value-display";
import type { OutputView } from "./shared/use-output-viewer";
import type { ItemRun } from "./step-run-panel/step-runs";
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";
import type {
  FlowDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { ReactNode } from "react";

const header = css({ display: "flex", alignItems: "center", gap: "2" });
const headerText = css({ flex: "1", minWidth: "0" });
const status = css({ display: "flex", flexDirection: "column", gap: "2" });
const statusLines = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.5",
  minWidth: "0",
});
const firstLine = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  minWidth: "0",
  textStyle: "sm",
  color: "fg.body",
  whiteSpace: "nowrap",
});
/* The glyphs are drawn inset in their box: this starts the mark's ink at the text edge, where the quiet lines start. */
const flushMark = css({ display: "flex", ml: "-1" });
const firstLineText = css({ minWidth: "0", truncate: true });
const stateWord = css({ color: "fg.heading" });
const note = css({ textStyle: "sm", color: "fg.subtle" });
const answerLink = css({ alignSelf: "flex-start" });
const values = css({ display: "flex", flexDirection: "column", gap: "4" });
const value = css({ display: "flex", flexDirection: "column", gap: "1" });
const valueName = css({ textStyle: "sm", color: "fg.body" });
const outputHead = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  ml: "-1",
});
const outputBody = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  pl: "6",
});

const tickMs = 1_000;

/** The time now, kept current while `ticking`, e.g. to count up how long a step has been running. */
const useNow = (ticking: boolean) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!ticking) {
      return;
    }

    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), tickMs);

    return () => clearInterval(interval);
  }, [ticking]);

  return now;
};

/**
 * A step's status line and the quiet lines under it. The clock ticks in here, so that a step still going re-renders
 * these lines each second and not the values under them.
 */
const StatusLines = ({
  mark,
  live,
  runs,
  perItem,
  running,
  askedAt,
}: {
  mark: StepRunMark;
  live: boolean;
  runs: ItemRun[];
  perItem: boolean;
  running: boolean;
  askedAt: string | null;
}) => {
  const now = useNow(running);
  const { state, word, facts, notes } = getStatusLine({
    mark,
    live,
    runs,
    perItem,
    running,
    askedAt,
    now,
  });

  return (
    <div className={statusLines}>
      <span className={firstLine}>
        {/* Its word names it. */}
        <span aria-hidden className={flushMark}>
          <RunGlyph state={state} />
        </span>
        <span className={firstLineText}>
          <span className={stateWord}>{word}</span>
          {facts.map((fact) => ` · ${fact}`).join("")}
        </span>
      </span>
      {notes.map((line) => (
        <span key={line} className={note}>
          {line}
        </span>
      ))}
    </div>
  );
};

/** An input or output, its name over its value. */
const RunValueRow = ({
  name,
  children,
}: {
  name: ReactNode;
  children: ReactNode;
}) => (
  <div className={value}>
    <span className={valueName}>{name}</span>
    {children}
  </div>
);

/** An output, open to show its value and the steps that use it, or closed to just its name. */
const OutputRow = ({
  label,
  name,
  onClose,
  children,
}: {
  /** What the row's toggle shows, for those who can't see it. */
  label: string;
  name: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(true);

  return (
    <div className={value}>
      <span className={outputHead}>
        <Button
          variant="ghost"
          size="xs"
          iconName={open ? "chevronDown" : "chevronRight"}
          aria-label={label}
          aria-expanded={open}
          onClick={() => {
            if (open) {
              onClose();
            }
            setOpen(!open);
          }}
        />
        <span className={valueName}>{name}</span>
      </span>
      {open && <div className={outputBody}>{children}</div>}
    </div>
  );
};

/**
 * The panel beside a run's canvas for the step selected: its state, timing and last error, what it got and what it
 * gave, and where what it gave is used. A step that runs per item of a for-each step, and a for-each step, show their
 * items' counts; a step that runs per item also shows the inputs every item got the same.
 */
export const StepRunPanel = ({
  step,
  inner,
  flowDefinition,
  mark,
  stepRuns,
  waitingOnPerson,
  live,
  runPageHref,
  highlightedStepId,
  onHighlightStep,
  inert,
  onOpenValue,
}: {
  step: StepDefinition<string>;
  /** Inside a for-each step, so it runs once per item. */
  inner: boolean;
  /** The flow as the run ran it. */
  flowDefinition: FlowDefinition<string>;
  mark: StepRunMark;
  stepRuns: Map<string, FlowRunStepRunState>;
  /** When each step run waiting on a person asked its questions, by step run id. */
  waitingOnPerson: Map<string, string>;
  live: boolean;
  /** The run's page outside the editor, where a person can answer a step's questions, once its path is known. */
  runPageHref: string | null;
  highlightedStepId: string | null;
  onHighlightStep: (stepId: string | null) => void;
  /** Covered by a value it opened, so out of reach until that's closed. */
  inert: boolean;
  onOpenValue: (view: OutputView, options?: { wide: boolean }) => void;
}) => {
  const runs = useMemo(() => getRunsOfStep(step, stepRuns), [step, stepRuns]);
  const perItem = inner || step.kind === "for-each";
  /* The first of its runs to ask, for a step that runs per item. */
  const askedAt =
    runs
      .flatMap(({ stepRun }) => waitingOnPerson.get(stepRun.stepId) ?? [])
      .toSorted()[0] ?? null;
  /*
   * Timed up to now while it's still going: running, or waiting on a person, which outranks running items. A step run
   * per item is still going while items are yet to be scheduled, though every run so far has closed.
   */
  const running =
    live && (mark.state === "running" || mark.state === "needsReview");
  const lastError = useMemo(() => getLastError(runs), [runs]);
  /* The output whose "Used in" entry set the highlight: only it shows the highlight, and only closing it clears it. */
  const [highlightingOutput, setHighlightingOutput] = useState<string | null>(
    null,
  );
  const getHighlightFrom = (outputName: string) =>
    highlightingOutput === outputName ? highlightedStepId : null;
  const highlightFrom = (outputName: string) => (stepId: string | null) => {
    setHighlightingOutput(stepId === null ? null : outputName);
    onHighlightStep(stepId);
  };
  const hasItems = perItem && !!mark.items && getItemTotal(mark.items) > 0;

  const usesOf = useMemo(
    () => indexValueUses(flowDefinition.steps),
    [flowDefinition.steps],
  );
  const shapes = useMemo(
    () => createStepShapeResolver(flowDefinition),
    [flowDefinition],
  );

  const getItemName = useItemNames(flowDefinition);
  const { icon, tone } = getStepDisplay(step);
  const name =
    step.kind === "for-each" && !step.description
      ? `For each ${getItemName(step.stepId)}`
      : getStepName(step);
  const actionDefinition =
    step.kind === "action"
      ? getActionDefinition(step.actionDefinitionId)
      : undefined;

  const [onlyRun] = runs;
  /* A for-each step's runs are its steps', whose inputs aren't its own. */
  const { common: inputs, varying } = useMemo(
    () =>
      step.kind === "for-each"
        ? { common: [], varying: [] }
        : inner
          ? getCommonInputs(runs)
          : { common: onlyRun?.stepRun.inputs ?? [], varying: [] },
    [step.kind, inner, runs, onlyRun],
  );
  /* An action this version of the app doesn't know still shows the outputs it gave. */
  const outputNames =
    step.kind === "for-each"
      ? [step.collect.as]
      : (actionDefinition?.outputs.map((output) => output.name) ??
        onlyRun?.stepRun.outputs?.map((output) => output.outputName) ??
        []);

  /* A value opens under its input's or output's name, from this step. */
  const renderValue = (title: string, display: ValueDisplay) => (
    <RunValue
      display={display}
      onOpen={(content, options) =>
        onOpenValue({ ...content, title, source: name }, options)
      }
    />
  );

  const labelOutput = (outputName: string) =>
    getOutputLabel(actionDefinition?.actionDefinitionId, outputName);

  const renderOutputValue = (outputName: string) => {
    if (perItem) {
      return null;
    }

    const output = onlyRun?.stepRun.outputs?.find(
      (stepOutput) => stepOutput.outputName === outputName,
    );

    if (output) {
      return renderValue(
        labelOutput(outputName),
        getValueDisplay(output.payload),
      );
    }

    return (
      <span className={note}>
        {live && !onlyRun?.stepRun.closedAt ? "Not given yet" : "Not given"}
      </span>
    );
  };

  const getOutputUses = (outputName: string): ValueUse[] =>
    usesOf({ kind: "step-output", stepId: step.stepId, outputName });

  return (
    <SidePanel label={name} inert={inert}>
      <div className={header}>
        <StepIconTile icon={icon} tone={tone} size="large" />
        <div className={headerText}>
          <PanelTitle>{name}</PanelTitle>
        </div>
      </div>
      <div className={status}>
        <StatusLines
          mark={mark}
          live={live}
          runs={runs}
          perItem={perItem}
          running={running}
          askedAt={askedAt}
        />
        {lastError && (
          <StepRunError
            message={lastError.error.message}
            context={lastError.context ?? undefined}
          />
        )}
        {askedAt && runPageHref && (
          <Button
            variant="subtle"
            size="sm"
            href={runPageHref}
            target="_blank"
            iconName="externalLink"
            iconPosition="right"
            className={answerLink}
          >
            Answer on the run's page
          </Button>
        )}
        {hasItems && (
          <span className={note}>
            Each item has its own values, which aren't shown here.
          </span>
        )}
      </div>
      {(inputs.length > 0 || varying.length > 0) && (
        <PanelSection title="Inputs">
          <div className={values}>
            {sortInputs(
              inputs,
              actionDefinition?.inputs.map((input) => input.name) ?? [],
            ).map(({ inputName, payload }) => (
              <RunValueRow
                key={inputName}
                name={
                  <ValueName
                    name={getNameLabel(inputName)}
                    shape={getPayloadShape(payload)}
                  />
                }
              >
                {renderValue(getNameLabel(inputName), getValueDisplay(payload))}
              </RunValueRow>
            ))}
            {varying.length > 0 && (
              <span className={note}>
                Differs by item: {varying.map(getNameLabel).join(", ")}
              </span>
            )}
          </div>
        </PanelSection>
      )}
      {outputNames.length > 0 && (
        <PanelSection title="Outputs">
          <div className={values}>
            {outputNames.map((outputName) => (
              <OutputRow
                key={outputName}
                label={`${labelOutput(outputName)} value`}
                onClose={() => {
                  if (getHighlightFrom(outputName) !== null) {
                    highlightFrom(outputName)(null);
                  }
                }}
                name={
                  <ValueName
                    name={labelOutput(outputName)}
                    shape={shapes.getStepOutputShape(step.stepId, outputName)}
                  />
                }
              >
                {renderOutputValue(outputName)}
                <OutputUses
                  valueUses={getOutputUses(outputName)}
                  highlightedStepId={getHighlightFrom(outputName)}
                  onHighlightStep={highlightFrom(outputName)}
                />
              </OutputRow>
            ))}
          </div>
        </PanelSection>
      )}
    </SidePanel>
  );
};
