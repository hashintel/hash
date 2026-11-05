import { stepNoun } from "../shared/step-display";

import type { MenuItem } from "@hashintel/ds-components";
import type {
  FlowConnection,
  FlowEditor,
  StepPosition,
} from "@local/hash-isomorphic-utils/flows/flow-editor";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

export type ContextTarget =
  | { kind: "step"; stepId: string }
  | { kind: "port"; stepId: string; side: "input" | "output" }
  | { kind: "connection"; connection: FlowConnection }
  | { kind: "start-line"; stepId: string }
  | { kind: "selection"; stepIds: string[] };

export type AddStepAt = (
  actionDefinitionId: string,
  position: StepPosition,
) => void;

export const getContextMenuItems = ({
  target,
  editor,
  topLevelSteps,
  openAddMenu,
  selectStep,
}: {
  target: ContextTarget | null;
  editor: FlowEditor;
  topLevelSteps: Map<string, StepDefinition<string>>;
  /** Opens the "+" list where the menu was opened, and adds the picked action with `addStep`. */
  openAddMenu: (addStep: AddStepAt) => void;
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
  const insertStepHere = (addStep: AddStepAt): MenuItem => ({
    id: "insert-step",
    text: `Insert ${stepNoun.singular} here`,
    icon: "plus",
    onClick: () => openAddMenu(addStep),
  });
  const removeConnections = (connections: FlowConnection[]) => {
    for (const connection of connections) {
      editor.removeConnection(connection);
    }
  };

  const getConnections = (stepId: string) => ({
    incoming: (topLevelSteps.get(stepId)?.runAfter ?? []).map(
      ({ stepId: from }) => ({ from, to: stepId }),
    ),
    outgoing: [...topLevelSteps.values()]
      .filter(({ runAfter }) =>
        runAfter?.some(({ stepId: from }) => from === stepId),
      )
      .map(({ stepId: to }) => ({ from: stepId, to })),
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
      const atPort = target.side === "input" ? incoming : outgoing;

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
        insertStepHere((actionDefinitionId, position) =>
          selectStep(
            editor.addStep(actionDefinitionId, {
              into: connection,
              position,
            }),
          ),
        ),
      ];
    }
    case "start-line": {
      const { stepId: to } = target;

      /* A Start line isn't stored, so the new step just goes before its target. */
      return [
        insertStepHere((actionDefinitionId, position) => {
          const stepId = editor.addStep(actionDefinitionId, { position });

          editor.addConnection({ from: stepId, to });
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
