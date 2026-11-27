import { stepNoun } from "../shared/step-display";
import { connectFromNewStep } from "../shared/step-paths";
import { addPickedStep } from "./canvas-actions";

import type { MenuItem } from "@hashintel/ds-components";
import type {
  FlowConnection,
  FlowEditor,
  StepPosition,
} from "@local/hash-isomorphic-utils/flows/flow-editor";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

export type ContextTarget =
  | { kind: "step"; stepId: string }
  | {
      kind: "port";
      stepId: string;
      side: "input" | "output";
      /** The path an output port is for, on a step that branches. */
      outputName?: string;
    }
  | { kind: "connection"; connection: FlowConnection }
  | { kind: "start-line"; stepId: string }
  | { kind: "selection"; stepIds: string[] };

/** Adds what was picked (see `addPickedStep`) at `position`, relative to the box it goes in, if any. */
export type AddStepAt = (addId: string, position: StepPosition) => void;

export const getContextMenuItems = ({
  target,
  editor,
  steps,
  openAddMenu,
  selectStep,
}: {
  target: ContextTarget | null;
  editor: FlowEditor;
  /** Every step at any depth, by id, and the for-each step it's directly inside, if any. */
  steps: Map<
    string,
    { step: StepDefinition<string>; parentStepId: string | null }
  >;
  /**
   * Opens the "+" list where the menu was opened, and adds the picked step with `addStep`, inside `parentStepId` if
   * it's given.
   */
  openAddMenu: (addStep: AddStepAt, parentStepId: string | null) => void;
  selectStep: (stepId: string) => void;
}): MenuItem[] => {
  const disconnectAll = (
    stepIds: string[],
    { disabled = false } = {},
  ): MenuItem => ({
    id: "disconnect-all",
    text: "Disconnect all",
    icon: "close",
    disabled,
    onClick: () => {
      for (const stepId of stepIds) {
        editor.disconnectStep(stepId);
      }
    },
  });
  const insertStepHere = (
    addStep: AddStepAt,
    parentStepId: string | null = null,
  ): MenuItem => ({
    id: "insert-step",
    text: `Insert ${stepNoun.singular} here`,
    icon: "plus",
    onClick: () => openAddMenu(addStep, parentStepId),
  });
  const removeConnections = (connections: FlowConnection[]) => {
    for (const connection of connections) {
      editor.removeConnection(connection);
    }
  };

  const getConnections = (stepId: string) => ({
    incoming: (steps.get(stepId)?.step.runAfter ?? []).map(
      ({ stepId: from, outputName }) => ({ from, to: stepId, outputName }),
    ),
    outgoing: [...steps.values()].flatMap(
      ({ step: { stepId: to, runAfter } }) =>
        (runAfter ?? [])
          .filter(({ stepId: from }) => from === stepId)
          .map(({ outputName }) => ({ from: stepId, to, outputName })),
    ),
  });

  switch (target?.kind) {
    case "step": {
      const { incoming, outgoing } = getConnections(target.stepId);

      return [
        {
          id: "disconnect-previous",
          text: "Disconnect from previous",
          icon: "plug",
          disabled: incoming.length === 0,
          onClick: () => removeConnections(incoming),
        },
        disconnectAll([target.stepId], {
          disabled: incoming.length + outgoing.length === 0,
        }),
      ];
    }
    case "port": {
      const { incoming, outgoing } = getConnections(target.stepId);
      const atPort =
        target.side === "input"
          ? incoming
          : outgoing.filter(
              ({ outputName }) => outputName === target.outputName,
            );

      return [
        {
          id: "disconnect",
          text: "Disconnect",
          icon: "plug",
          disabled: atPort.length === 0,
          onClick: () => removeConnections(atPort),
        },
        disconnectAll([target.stepId], {
          disabled: incoming.length + outgoing.length === 0,
        }),
      ];
    }
    case "connection": {
      const { connection } = target;

      return [
        {
          id: "disconnect",
          text: "Disconnect",
          icon: "plug",
          onClick: () => editor.removeConnection(connection),
        },
        insertStepHere((addId, position) => {
          const stepId = addPickedStep(editor, addId, {
            into: connection,
            position,
          });

          /* `into` puts the step that followed on no path of the new step. */
          connectFromNewStep(
            editor,
            { stepId, actionDefinitionId: addId },
            connection.to,
          );
          selectStep(stepId);
        }, steps.get(connection.to)?.parentStepId),
      ];
    }
    case "start-line": {
      const { stepId: to } = target;

      /* A Start line isn't stored, so the new step just goes before its target. */
      return [
        insertStepHere((addId, position) => {
          const stepId = addPickedStep(editor, addId, { position });

          connectFromNewStep(editor, { stepId, actionDefinitionId: addId }, to);
          selectStep(stepId);
        }),
      ];
    }
    case "selection":
      return [disconnectAll(target.stepIds)];
    case undefined:
      /* Never shown, but an empty `items` makes `RightClickMenu` remount the canvas. */
      return [disconnectAll([])];
  }
};
