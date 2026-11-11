import { useCallback, useState } from "react";

import { Banner, Button, LoadingSpinner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { RunCanvas } from "./canvas";
import { RunLeftPanel } from "./left-panel";
import { flowChangedBetween } from "./run-view/flow-changed";
import { useRun } from "./run-view/use-run";

import type { EntityId } from "@blockprotocol/type-system";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

const body = css({ display: "flex", flex: "1", minHeight: "0" });
const canvasArea = css({ position: "relative", flex: "1" });
const notices = css({
  position: "absolute",
  zIndex: "docked",
  top: "4",
  left: "4",
  right: "4",
  display: "flex",
  flexDirection: "column",
  gap: "2",
  maxWidth: "[560px]",
  mx: "auto",
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
 * show its state, and follow the run while it's going.
 */
export const RunView = ({
  flowRunEntityId,
  flowDefinitionEntityId,
  currentDefinition,
  onBackToLogs,
}: {
  flowRunEntityId: EntityId;
  flowDefinitionEntityId: EntityId;
  /** The flow as it is now. */
  currentDefinition: FlowDefinition<string>;
  onBackToLogs: () => void;
}) => {
  const run = useRun({
    flowRunEntityId,
    flowDefinitionEntityId,
    currentDefinition,
  });

  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ stepId: string } | null>(
    null,
  );
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

  const { ranDefinition, marks, checkFailure } = run;
  const flowDefinition = ranDefinition ?? currentDefinition;

  return (
    <div className={body}>
      <RunLeftPanel
        steps={flowDefinition.steps}
        runMarks={marks}
        selectedStepIds={selectedStepIds}
        onStepClick={(stepId) => {
          setSelectedStepIds([stepId]);
          setFocusRequest({ stepId });
        }}
        collapsedGroupIds={collapsedStepIds}
        onToggleGroup={toggleCollapsed}
        onCollapseAll={(stepIds) => setCollapsedStepIds(new Set(stepIds))}
      />
      <div className={canvasArea}>
        <div className={notices}>
          {ranDefinition === null ? (
            <Banner tone="warning">
              <Banner.Title>Shown on the flow as it is now</Banner.Title>
              <Banner.Description>
                The version of the flow this run used couldn't be read, so its
                steps may not match the ones shown.
              </Banner.Description>
            </Banner>
          ) : (
            flowChangedBetween(ranDefinition, currentDefinition) && (
              <Banner tone="neutral">
                <Banner.Description>
                  The flow has changed since this run. It's shown as it was when
                  the run started.
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
        </div>
        <RunCanvas
          flowDefinition={flowDefinition}
          marks={marks}
          selectedStepIds={selectedStepIds}
          onSelectionChange={setSelectedStepIds}
          focusRequest={focusRequest}
          collapsedStepIds={collapsedStepIds}
          onToggleCollapsed={toggleCollapsed}
        />
      </div>
    </div>
  );
};
