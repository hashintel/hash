import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { FlowNetView } from "../../../shared/flow-visualizer/flow-net-view";
import { CanvasNotices, NetSwitch, NetSwitchHost } from "./net-switch";
import { findStep, getStepName } from "./shared/find-step";

import type { FlowShape } from "./run-path";
import type { EntityId } from "@blockprotocol/type-system";
import type { FlowEditorState } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { ReactNode } from "react";

/* Scrolls a long list, centred when it fits, below the switch. */
const centered = css({
  display: "flex",
  flex: "1",
  overflowY: "auto",
  p: "6",
  pt: "16",
});
const content = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
  width: "full",
  maxWidth: "[480px]",
  m: "auto",
});
const title = css({ fontWeight: "medium", color: "fg.heading" });
const text = css({ textStyle: "sm", color: "fg.muted" });
const problem = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "1.5",
  textStyle: "sm",
  color: "fg.heading",
});
/* As a step's error in a run, centred on the first line. */
const indicator = css({
  display: "flex",
  flexShrink: "0",
  mt: "0.5",
  color: "status.error.fg.muted",
});
const problemText = css({ flex: "1" });

/**
 * The flow being edited as its Petri net, without tokens, compiled whenever it's shown and never saved. A flow with
 * errors can't be compiled, so they're listed instead, each with a way to its step.
 */
export const EditorNetView = ({
  editorState: { flowDefinition, flowProblems, problemsByStepId },
  flowDefinitionEntityId,
  notices,
  onShapeChange,
  onShowStep,
}: {
  editorState: FlowEditorState;
  flowDefinitionEntityId: EntityId;
  /** Banners to float over it, e.g. that an autosave was refused. */
  notices: ReactNode;
  onShapeChange: (shape: FlowShape) => void;
  /** Shows the flow with this step selected. */
  onShowStep: (stepId: string) => void;
}) => {
  /* Warnings, e.g. an unused input, don't stop it compiling. */
  const errors = [
    ...flowProblems,
    ...[...problemsByStepId.values()].flat(),
  ].filter(({ severity }) => severity === "error");
  const compilable = errors.length === 0 && flowDefinition.steps.length > 0;

  return (
    <NetSwitchHost>
      {compilable ? (
        <FlowNetView
          /* Without errors, every step's action exists. */
          flowDefinition={flowDefinition as FlowDefinition}
          flowDefinitionEntityId={flowDefinitionEntityId}
          framed={false}
        />
      ) : (
        <div className={centered}>
          <div className={content}>
            <div>
              <p className={title}>
                This flow can't be shown as a Petri net yet
              </p>
              <p className={text}>
                {errors.length === 0
                  ? "Add a step to see the net it compiles to."
                  : errors.length === 1
                    ? "Fix this problem in the flow first."
                    : `Fix these ${errors.length} problems in the flow first.`}
              </p>
            </div>
            {errors.map(({ code, path, message, stepId }) => {
              const step =
                stepId === undefined
                  ? undefined
                  : findStep(flowDefinition.steps, stepId)?.step;

              return (
                <div
                  key={`${code}-${path.join(".")}-${message}`}
                  className={problem}
                >
                  <span className={indicator}>
                    <Icon name="error" size="sm" alt="Error" />
                  </span>
                  <span className={problemText}>
                    {step ? `${getStepName(step)}: ${message}` : message}
                  </span>
                  {step && (
                    <Button
                      variant="linkSubtle"
                      onClick={() => onShowStep(step.stepId)}
                    >
                      Show
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <CanvasNotices overNet={compilable}>{notices}</CanvasNotices>
      <NetSwitch
        shape="net"
        overNet={compilable}
        onShapeChange={onShapeChange}
      />
    </NetSwitchHost>
  );
};
