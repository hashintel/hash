import { useEffect, useMemo, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";

import { getStepName } from "../shared/find-step";
import { getNameLabel } from "../shared/name-label";
import { RunGlyph } from "../shared/run-marks";
import { PanelSection, PanelTitle, SidePanel } from "../shared/side-panel";
import { getActionDefinition, getStepDisplay } from "../shared/step-display";
import { StepIconTile } from "../shared/step-icon-tile";
import { stepStateLabels } from "../shared/step-states";
import { ValueName } from "../shared/value-name";
import { indexValueUses } from "../shared/value-uses";
import { OutputUses } from "./step-run-panel/output-uses";
import { RunValue } from "./step-run-panel/run-value";
import {
  getItemCountsLine,
  getStatusLines,
} from "./step-run-panel/status-lines";
import { StepRunError } from "./step-run-panel/step-run-error";
import {
  getCommonInputs,
  getLastError,
  getRunsOfStep,
} from "./step-run-panel/step-runs";
import {
  getPayloadShape,
  getValueDisplay,
} from "./step-run-panel/value-display";

import type { StepRunMark } from "../shared/step-states";
import type { ValueUse } from "../shared/value-uses";
import type { FlowRunStepRunState } from "@local/hash-isomorphic-utils/flows/step-runs";
import type {
  FlowDefinition,
  StepDefinition,
  StepInput,
} from "@local/hash-isomorphic-utils/flows/types";
import type { ReactNode } from "react";

const header = css({ display: "flex", alignItems: "flex-start", gap: "2" });
const headerText = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  flex: "1",
  minWidth: "0",
});
const state = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  textStyle: "sm",
  color: "fg.body",
});
const status = css({ display: "flex", flexDirection: "column", gap: "2" });
const statusLines = css({ display: "flex", flexDirection: "column" });
const statusLine = css({ textStyle: "sm", color: "fg.muted" });
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
  name,
  children,
}: {
  name: ReactNode;
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
          aria-label={open ? "Hide" : "Show"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        />
        <span className={valueName}>{name}</span>
      </span>
      {open && <div className={outputBody}>{children}</div>}
    </div>
  );
};

/** Inputs in the order the step's action lists them, any it doesn't after. */
const sortInputs = (inputs: StepInput[], order: string[]) =>
  inputs.toSorted(
    (left, right) =>
      (order.indexOf(left.inputName) + 1 || order.length + 1) -
      (order.indexOf(right.inputName) + 1 || order.length + 1),
  );

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
}: {
  step: StepDefinition<string>;
  /** Inside a for-each step, so it runs once per item. */
  inner: boolean;
  /** The flow as the run ran it. */
  flowDefinition: FlowDefinition<string>;
  mark: StepRunMark;
  stepRuns: Map<string, FlowRunStepRunState>;
  waitingOnPerson: Set<string>;
  live: boolean;
  /** The run's page outside the editor, where a person can answer a step's questions. */
  runPageHref: string;
  highlightedStepId: string | null;
  onHighlightStep: (stepId: string | null) => void;
}) => {
  const runs = getRunsOfStep(step, stepRuns);
  const perItem = inner || step.kind === "for-each";
  const waiting = runs.some(({ stepRun }) =>
    waitingOnPerson.has(stepRun.stepId),
  );
  const now = useNow(live && runs.some(({ stepRun }) => !stepRun.closedAt));
  const lastError = getLastError(runs);

  const usesOf = useMemo(
    () => indexValueUses(flowDefinition.steps),
    [flowDefinition.steps],
  );
  const shapes = useMemo(
    () => createStepShapeResolver(flowDefinition),
    [flowDefinition],
  );

  const { icon, tone } = getStepDisplay(step);
  const name = getStepName(step);
  const actionDefinition =
    step.kind === "action"
      ? getActionDefinition(step.actionDefinitionId)
      : undefined;

  const [onlyRun] = runs;
  /* A for-each step's runs are its steps', whose inputs aren't its own. */
  const { common: inputs, varying } =
    step.kind === "for-each"
      ? { common: [], varying: [] }
      : inner
        ? getCommonInputs(runs)
        : { common: onlyRun?.stepRun.inputs ?? [], varying: [] };
  const outputNames =
    step.kind === "for-each"
      ? [step.collect.as]
      : (actionDefinition?.outputs.map((output) => output.name) ?? []);

  const renderOutputValue = (outputName: string) => {
    if (perItem) {
      return null;
    }

    const output = onlyRun?.stepRun.outputs?.find(
      (candidate) => candidate.outputName === outputName,
    );

    if (output) {
      return <RunValue display={getValueDisplay(output.payload)} />;
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
    <SidePanel label={name}>
      <div className={header}>
        <StepIconTile icon={icon} tone={tone} size="large" />
        <div className={headerText}>
          <PanelTitle>{name}</PanelTitle>
          <span className={state}>
            <RunGlyph state={mark.state} />
            {stepStateLabels[mark.state]}
          </span>
        </div>
      </div>
      {(runs.length > 0 || perItem) && (
        <div className={status}>
          <div className={statusLines}>
            {perItem && mark.items && (
              <span className={statusLine}>
                {getItemCountsLine(mark.items)}
              </span>
            )}
            {getStatusLines({
              runs,
              perItem,
              waitingOnPerson: waiting,
              now,
            }).map((line) => (
              <span key={line} className={statusLine}>
                {line}
              </span>
            ))}
          </div>
          {lastError && (
            <StepRunError
              message={lastError.error.message}
              context={
                lastError.itemIndex === null
                  ? undefined
                  : `Item ${lastError.itemIndex + 1}`
              }
            />
          )}
          {waiting && (
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
          {perItem && (
            <span className={note}>
              Each item's values will show once you can step through the items.
            </span>
          )}
        </div>
      )}
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
                <RunValue display={getValueDisplay(payload)} />
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
                name={
                  <ValueName
                    name={getNameLabel(outputName)}
                    shape={shapes.getStepOutputShape(step.stepId, outputName)}
                  />
                }
              >
                {renderOutputValue(outputName)}
                <OutputUses
                  valueUses={getOutputUses(outputName)}
                  highlightedStepId={highlightedStepId}
                  onHighlightStep={onHighlightStep}
                />
              </OutputRow>
            ))}
          </div>
        </PanelSection>
      )}
    </SidePanel>
  );
};
