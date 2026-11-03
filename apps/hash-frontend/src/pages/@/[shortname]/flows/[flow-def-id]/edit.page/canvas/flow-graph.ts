import { getStepsBefore } from "../shared/step-order";

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

/** The size of a step's card, and of Start's. */
export const stepCardSize = { width: 200, height: 59 };

/** The space between steps that run one after the other, as Organize leaves it. */
export const stepGap = 64;

/** The space around the steps inside a for-each step's box, and the height of its header. */
export const forEachBoxPadding = { header: 40, side: 16 };

/** Where a for-each step's steps are drawn in its box, and the box's size. */
export type ForEachLayout = {
  size: { width: number; height: number };
  /** By step id, relative to the box. */
  positions: Map<string, StepPosition>;
};

export const startNodeId = "start";

export const getStepNodeId = (stepId: string) => `step:${stepId}`;

type StepNodeDataBase = {
  problems: FlowDefinitionDiagnosticWithStepId[];
  /** Whether the step is inside a for-each step, so can't be edited here. */
  inner: boolean;
};

export type StartNode = Node<Record<string, never>, "start">;

export type ActionStepNode = Node<
  StepNodeDataBase & { step: ActionStepDefinition<string> },
  "step"
>;

export type ForEachStepNode = Node<
  StepNodeDataBase & { step: ForEachStepDefinition<string> },
  "forEach"
>;

export type FlowNode = StartNode | ActionStepNode | ForEachStepNode;

export type ConnectionEdgeData =
  /** A connection between two top-level steps. */
  | { kind: "connection"; connection: FlowConnection }
  /** A line from Start to a top-level step with nothing before it, which isn't stored. */
  | { kind: "start"; stepId: string }
  /** A connection between two steps inside a for-each step, which can't be edited here. */
  | { kind: "inner" };

export type ConnectionEdge = Edge<ConnectionEdgeData, "connection">;

const getConnectionEdgeId = ({ from, to }: FlowConnection) =>
  `connection:${JSON.stringify([from, to])}`;

/**
 * Where Start is drawn: it isn't stored, so it sits a gap to the left of the leftmost top-level step with nothing
 * before it, level with it.
 */
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
 * The nodes and edges that draw a flow: Start, a card for each step at its position, and the connections between
 * them, with a line from Start to each top-level step with nothing before it. A for-each step is a box with its steps
 * inside, at the places `forEachLayouts` gives them. Positions not saved yet are drawn at the origin.
 */
export const getFlowGraph = ({
  flowDefinition,
  problemsByStepId,
  forEachLayouts,
}: Pick<FlowEditorState, "flowDefinition" | "problemsByStepId"> & {
  forEachLayouts: Map<string, ForEachLayout>;
}): { nodes: FlowNode[]; edges: ConnectionEdge[] } => {
  const nodes: FlowNode[] = [
    {
      id: startNodeId,
      type: "start",
      position: getStartPosition(flowDefinition.steps),
      data: {},
      draggable: false,
      selectable: false,
      deletable: false,
    },
  ];
  const edges: ConnectionEdge[] = [];

  const addSteps = (
    steps: StepDefinition<string>[],
    parent?: { stepId: string; layout: ForEachLayout | undefined },
  ) => {
    const stepIds = new Set(steps.map(({ stepId }) => stepId));

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

        nodes.push({
          ...placement,
          type: "forEach",
          data: { ...data, step },
          ...(layout && {
            width: layout.size.width,
            height: layout.size.height,
          }),
        });

        addSteps(step.steps, { stepId: step.stepId, layout });
      }

      for (const { stepId: from } of step.runAfter ?? []) {
        if (!stepIds.has(from)) {
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
