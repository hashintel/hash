import { getStepsBefore } from "../shared/step-order";
import { collapsedForEachSize, stepCardSize, stepGap } from "./sizes";

import type { StepRunMark } from "../shared/step-states";
import type {
  FlowConnection,
  FlowEditorState,
  StepPosition,
} from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  ActionStepDefinition,
  ForEachStepDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { FlowDefinitionDiagnosticWithStepId } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";
import type { Edge, Node } from "@xyflow/react";

export type ForEachLayout = {
  size: { width: number; height: number };
  /** By step id, relative to the box. */
  positions: Map<string, StepPosition>;
};

export const startNodeId = "start";

export const getStepNodeId = (stepId: string) => `step:${stepId}`;

/** How a card shows its step in the run a canvas shows. */
export type CardRun = {
  mark: StepRunMark;
  /** Whether one of the step's outputs is one of the flow's, which show in its runs' results. */
  featured: boolean;
};

type StepNodeDataBase = {
  problems: FlowDefinitionDiagnosticWithStepId[];
  /** Inside a for-each step, so read-only. */
  inner: boolean;
  run?: CardRun;
};

export type StartNode = Node<{ run?: CardRun }, "start">;

export type ActionStepNode = Node<
  StepNodeDataBase & { step: ActionStepDefinition<string> },
  "step"
>;

export type ForEachStepNode = Node<
  StepNodeDataBase & {
    step: ForEachStepDefinition<string>;
    collapsed: boolean;
  },
  "forEach"
>;

export type FlowNode = StartNode | ActionStepNode | ForEachStepNode;

type ConnectionEdgeData =
  | { kind: "connection"; connection: FlowConnection }
  /** From Start to a top-level step with nothing before it; not stored. */
  | { kind: "start"; stepId: string }
  /** Between steps inside a for-each step; read-only. */
  | { kind: "inner" };

export type ConnectionEdge = Edge<ConnectionEdgeData, "connection">;

const getConnectionEdgeId = ({ from, to }: FlowConnection) =>
  `connection:${JSON.stringify([from, to])}`;

const getNestedRunAfterIds = (steps: StepDefinition<string>[]): string[] =>
  steps.flatMap((step) => [
    ...(step.runAfter ?? []).map(({ stepId }) => stepId),
    ...(step.kind === "for-each" ? getNestedRunAfterIds(step.steps) : []),
  ]);

/** Start isn't stored: it sits a gap to the left of the leftmost top-level step with nothing before it. */
export const getStartPosition = (
  steps: StepDefinition<string>[],
): StepPosition => {
  const stepsBefore = getStepsBefore(steps);
  const [first] = steps
    .filter((step) => stepsBefore.get(step.stepId)?.length === 0)
    .map(({ position }) => position ?? { x: 0, y: 0 })
    .toSorted((left, right) => left.x - right.x || left.y - right.y);

  return first
    ? { x: first.x - stepCardSize.width - stepGap, y: first.y }
    : { x: 0, y: 0 };
};

/**
 * A for-each step's inner steps go where `forEachLayouts` puts them; unsaved positions are drawn at the origin. A
 * top-level for-each step in `collapsedStepIds` is drawn without its steps.
 */
export const getFlowGraph = ({
  flowDefinition,
  problemsByStepId,
  forEachLayouts,
  collapsedStepIds,
}: Pick<FlowEditorState, "flowDefinition" | "problemsByStepId"> & {
  forEachLayouts: Map<string, ForEachLayout>;
  collapsedStepIds: Set<string>;
}): { nodes: FlowNode[]; edges: ConnectionEdge[] } => {
  const nodes: FlowNode[] = [
    {
      id: startNodeId,
      type: "start",
      position: getStartPosition(flowDefinition.steps),
      data: {},
      draggable: false,
      deletable: false,
    },
  ];
  const edges: ConnectionEdge[] = [];

  const addSteps = (
    steps: StepDefinition<string>[],
    parent?: {
      stepId: string;
      layout: ForEachLayout | undefined;
      /** Steps inside a box can also run after the steps around it. */
      stepIdsInScope: Set<string>;
    },
  ) => {
    const stepIdsInScope = new Set([
      ...(parent?.stepIdsInScope ?? []),
      ...steps.map(({ stepId }) => stepId),
    ]);

    for (const step of steps) {
      const id = getStepNodeId(step.stepId);
      const inner = parent !== undefined;
      const data = {
        problems: problemsByStepId.get(step.stepId) ?? [],
        inner,
      };
      const position = (parent
        ? parent.layout?.positions.get(step.stepId)
        : step.position) ?? { x: 0, y: 0 };
      const placement = {
        id,
        position,
        deletable: !inner,
        draggable: !inner,
        connectable: !inner,
        ...(parent && {
          parentId: getStepNodeId(parent.stepId),
          extent: "parent" as const,
        }),
      };

      if (step.kind === "action") {
        nodes.push({ ...placement, type: "step", data: { ...data, step } });
      } else {
        const layout = forEachLayouts.get(step.stepId);
        const collapsed = !inner && collapsedStepIds.has(step.stepId);
        const size = collapsed ? collapsedForEachSize : layout?.size;

        nodes.push({
          ...placement,
          type: "forEach",
          data: { ...data, step, collapsed },
          ...size,
        });

        if (collapsed) {
          const ownStepIdsBefore = new Set(
            (step.runAfter ?? []).map(({ stepId }) => stepId),
          );

          /* Lines to the steps inside a collapsed box go to the box. */
          for (const from of new Set(getNestedRunAfterIds(step.steps))) {
            if (stepIdsInScope.has(from) && !ownStepIdsBefore.has(from)) {
              edges.push({
                id: getConnectionEdgeId({ from, to: step.stepId }),
                type: "connection",
                source: getStepNodeId(from),
                target: id,
                data: { kind: "inner" },
                deletable: false,
                selectable: false,
                focusable: false,
              });
            }
          }
        } else {
          addSteps(step.steps, {
            stepId: step.stepId,
            layout,
            stepIdsInScope,
          });
        }
      }

      for (const { stepId: from } of step.runAfter ?? []) {
        if (!stepIdsInScope.has(from)) {
          continue;
        }

        const connection = { from, to: step.stepId };

        edges.push({
          id: getConnectionEdgeId(connection),
          type: "connection",
          source: getStepNodeId(from),
          target: id,
          data: inner ? { kind: "inner" } : { kind: "connection", connection },
          deletable: !inner,
          selectable: !inner,
          focusable: !inner,
        });
      }
    }
  };

  addSteps(flowDefinition.steps);

  const stepsBefore = getStepsBefore(flowDefinition.steps);

  for (const { stepId } of flowDefinition.steps) {
    if (stepsBefore.get(stepId)?.length === 0) {
      edges.push({
        id: `start:${stepId}`,
        type: "connection",
        source: startNodeId,
        target: getStepNodeId(stepId),
        data: { kind: "start", stepId },
        deletable: false,
        selectable: false,
        focusable: false,
      });
    }
  }

  return { nodes, edges };
};
