import { isEqual } from "lodash";
import { useCallback, useMemo, useState } from "react";

import { Banner, Button, LoadingSpinner } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import {
  getValidFlowDefinition,
  validateFlowDefinition,
} from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

import { useGetOwnerForEntity } from "../../../../../../components/hooks/use-get-owner-for-entity";
import { FlowNetView } from "../../../shared/flow-visualizer/flow-net-view";
import { RunCanvas } from "./canvas";
import { RunLeftPanel } from "./left-panel";
import { NetSwitch, NetSwitchHost } from "./net-switch";
import { flowChangedBetween } from "./run-view/flow-changed";
import { OutputViewer } from "./run-view/output-viewer";
import {
  outputSheetWidth,
  useOutputViewer,
} from "./run-view/shared/use-output-viewer";
import { StepRunPanel } from "./run-view/step-run-panel";
import { useRun } from "./run-view/use-run";
import { findStep } from "./shared/find-step";
import { getRunTrigger } from "./shared/flow-triggers";
import { getShortRunId } from "./shared/run-id";
import { sidePanelWidth } from "./shared/side-panel";
import { notReachedMark, startMark } from "./shared/step-states";

import type { TriggerCard } from "./canvas/flow-graph";
import type { FlowShape } from "./run-path";
import type { FlowSchedules } from "./shared/flow-triggers";
import type { EntityId } from "@blockprotocol/type-system";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

const body = css({ display: "flex", flex: "1", minHeight: "0" });
const canvasArea = css({ position: "relative", flex: "1" });
const notices = cva({
  base: {
    position: "absolute",
    zIndex: "docked",
    left: "4",
    right: "4",
    display: "flex",
    flexDirection: "column",
    gap: "2",
    maxWidth: "[560px]",
    mx: "auto",
  },
  /* Below Petrinaut's 48px header over the net. */
  variants: { overNet: { false: { top: "4" }, true: { top: "16" } } },
});
const centered = css({
  display: "flex",
  flex: "1",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "3",
  p: "6",
  textAlign: "center",
});
const messageTitle = css({ fontWeight: "medium", color: "fg.heading" });
const messageText = css({ textStyle: "sm", color: "fg.muted" });
const failure = css({ width: "full", maxWidth: "[560px]", textAlign: "start" });

const Message = ({
  title,
  text,
  onBackToLogs,
}: {
  title: string;
  text: string;
  onBackToLogs: () => void;
}) => (
  <div className={centered}>
    <div>
      <p className={messageTitle}>{title}</p>
      <p className={messageText}>{text}</p>
    </div>
    <Button size="sm" variant="subtle" onClick={onBackToLogs}>
      Back to runs
    </Button>
  </div>
);

/**
 * One of the flow's runs, on the flow's canvas as the run ran it, read-only: each step's card and row in the Steps tab
 * show its state, and follow the run while it's going. Selecting one step shows what it got and gave in a panel. On
 * the flow's Petri net, it shows the run's tokens, with a timeline to scrub through them.
 */
export const RunView = ({
  flowRunEntityId,
  flowDefinitionEntityId,
  currentDefinition,
  schedules,
  shape,
  onShapeChange,
  onBackToLogs,
}: {
  flowRunEntityId: EntityId;
  flowDefinitionEntityId: EntityId;
  /** The flow as it is now. */
  currentDefinition: FlowDefinition<string>;
  /** The flow's schedules, to name the one that started the run. */
  schedules: FlowSchedules;
  /** Whether it's shown on the flow's steps or on its Petri net. */
  shape: FlowShape;
  onShapeChange: (shape: FlowShape) => void;
  onBackToLogs: () => void;
}) => {
  const run = useRun({
    flowRunEntityId,
    flowDefinitionEntityId,
    currentDefinition,
  });

  const flowScheduleId = run.status === "loaded" ? run.flowScheduleId : null;
  const live = run.status === "loaded" && run.live;
  /* It fired as the run started, so it's done, as Start is. */
  const trigger = useMemo(
    (): TriggerCard => ({
      ...getRunTrigger(flowScheduleId, schedules),
      on: true,
      run: { mark: startMark, featured: false, live },
    }),
    [flowScheduleId, schedules, live],
  );
  /* For the net when the run's edition can't be read. Memoised, as each validation is a new object to compile. */
  const currentNetDefinition = useMemo(
    () =>
      shape === "net"
        ? getValidFlowDefinition(validateFlowDefinition(currentDefinition))
        : null,
    [shape, currentDefinition],
  );

  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ stepId: string } | null>(
    null,
  );
  /* The step a "Used in" entry in the selected step's panel highlights on the canvas. */
  const [highlightedStepId, setHighlightedStepId] = useState<string | null>(
    null,
  );
  const outputViewer = useOutputViewer();
  const getOwnerForEntity = useGetOwnerForEntity();
  const [collapsedStepIds, setCollapsedStepIds] = useState(
    () => new Set<string>(),
  );
  const toggleCollapsed = useCallback(
    (stepId: string) =>
      setCollapsedStepIds((collapsed) => {
        const next = new Set(collapsed);

        if (!next.delete(stepId)) {
          next.add(stepId);
        }

        return next;
      }),
    [],
  );

  switch (run.status) {
    case "loading":
      return (
        <div role="status" className={centered}>
          <LoadingSpinner size="lg" />
          <span className={messageText}>Loading run…</span>
        </div>
      );
    case "notFound":
      return (
        <Message
          title="Run not found"
          text="It may have been deleted, or be in a web you can't see."
          onBackToLogs={onBackToLogs}
        />
      );
    case "otherFlow":
      return (
        <Message
          title="This run is of another flow"
          text="Only this flow's runs can be shown here."
          onBackToLogs={onBackToLogs}
        />
      );
    case "failed":
      return (
        <div className={centered}>
          <div className={failure}>
            <Banner tone="error" role="status">
              <Banner.Title>Couldn't load this run</Banner.Title>
              <Banner.Description>{run.message}</Banner.Description>
              {run.retry && (
                <Banner.Actions>
                  <Banner.ActionButton onClick={run.retry}>
                    Try again
                  </Banner.ActionButton>
                </Banner.Actions>
              )}
            </Banner>
          </div>
        </div>
      );
  }

  const {
    ranDefinition,
    marks,
    stepRuns,
    waitingOnPerson,
    events,
    checkFailure,
  } = run;
  const flowDefinition = ranDefinition ?? currentDefinition;

  const noticeBanners = (
    <>
      {ranDefinition === null ? (
        <Banner tone="warning">
          <Banner.Title>Shown on the flow as it is now</Banner.Title>
          <Banner.Description>
            The version of the flow this run used couldn't be read, so its steps
            may not match the ones shown.
          </Banner.Description>
        </Banner>
      ) : (
        flowChangedBetween(ranDefinition, currentDefinition) && (
          <Banner tone="neutral">
            <Banner.Description>
              The flow has changed since this run. It's shown as it was when the
              run started.
            </Banner.Description>
          </Banner>
        )
      )}
      {checkFailure !== null && (
        <Banner tone="warning" role="status">
          <Banner.Title>Couldn't check for updates</Banner.Title>
          <Banner.Description>{checkFailure}</Banner.Description>
        </Banner>
      )}
    </>
  );

  if (shape === "net") {
    /* The run's edition was valid when it ran; the flow as it is now may not be. */
    const netDefinition = ranDefinition ?? currentNetDefinition;

    return (
      <NetSwitchHost>
        {netDefinition ? (
          <FlowNetView
            flowDefinition={netDefinition}
            flowDefinitionEntityId={flowDefinitionEntityId}
            flowRun={{
              flowRunEntityId,
              name: `Run ${getShortRunId(flowRunEntityId)}`,
              live,
              events,
            }}
            framed={false}
          />
        ) : (
          <div className={centered}>
            <div>
              <p className={messageTitle}>
                This run can't be shown on a Petri net
              </p>
              <p className={messageText}>
                The version of the flow it used couldn't be read, and the flow
                as it is now can't be compiled.
              </p>
            </div>
          </div>
        )}
        <div className={notices({ overNet: !!netDefinition })}>
          {noticeBanners}
        </div>
        <NetSwitch
          shape="net"
          overNet={!!netDefinition}
          onShapeChange={onShapeChange}
        />
      </NetSwitchHost>
    );
  }

  const [selectedStepId] = selectedStepIds;
  /* A selection can outlive its step, e.g. when the run's edition of the flow is read: no panel then. */
  const selected =
    selectedStepIds.length === 1 && selectedStepId !== undefined
      ? findStep(flowDefinition.steps, selectedStepId)
      : undefined;
  /* A new selection opens a new panel, without the "Used in" list that set the highlight, or a value it opened. */
  const selectSteps = (stepIds: string[]) => {
    if (!isEqual(stepIds, selectedStepIds)) {
      setHighlightedStepId(null);
      outputViewer.close();
    }
    setSelectedStepIds(stepIds);
  };
  /* The side sheet covers the panel, and more. */
  const coveredRight = selected
    ? outputViewer.wide
      ? outputSheetWidth
      : sidePanelWidth
    : 0;
  const ownerShortname = getOwnerForEntity({
    entityId: flowRunEntityId,
  }).shortname;

  return (
    <div className={body}>
      <RunLeftPanel
        flowDefinition={flowDefinition}
        runMarks={marks}
        live={live}
        selectedStepIds={selectedStepIds}
        onStepClick={(stepId) => {
          selectSteps([stepId]);
          setFocusRequest({ stepId });
        }}
        collapsedGroupIds={collapsedStepIds}
        onToggleGroup={toggleCollapsed}
        onCollapseAll={(stepIds) => setCollapsedStepIds(new Set(stepIds))}
      />
      <div className={canvasArea}>
        <div
          className={notices({ overNet: false })}
          style={coveredRight ? { right: coveredRight + 16 } : undefined}
        >
          {noticeBanners}
        </div>
        <RunCanvas
          flowDefinition={flowDefinition}
          marks={marks}
          live={live}
          selectedStepIds={selectedStepIds}
          onSelectionChange={selectSteps}
          focusRequest={focusRequest}
          collapsedStepIds={collapsedStepIds}
          onToggleCollapsed={toggleCollapsed}
          highlightedStepId={highlightedStepId}
          coveredRight={coveredRight}
          trigger={trigger}
        />
        <NetSwitch shape="flow" onShapeChange={onShapeChange} />
        {selected && (
          <>
            <StepRunPanel
              /* Each step's panel starts afresh, e.g. with its outputs open. */
              key={selected.step.stepId}
              step={selected.step}
              inner={selected.inner}
              flowDefinition={flowDefinition}
              mark={marks.get(selected.step.stepId) ?? notReachedMark}
              stepRuns={stepRuns}
              waitingOnPerson={waitingOnPerson}
              live={live}
              /* Its owner's shortname is empty until users and orgs have loaded. */
              runPageHref={
                ownerShortname
                  ? generateWorkerRunPath({
                      shortname: ownerShortname,
                      flowRunEntityId,
                    })
                  : null
              }
              highlightedStepId={highlightedStepId}
              onHighlightStep={setHighlightedStepId}
              inert={outputViewer.view !== null}
              onOpenValue={outputViewer.open}
            />
            <OutputViewer viewer={outputViewer} />
          </>
        )}
      </div>
    </div>
  );
};
