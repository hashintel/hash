import { getStepsBefore } from "../shared/step-order";
import { getStepPaths } from "../shared/step-paths";
import { collapsedForEachSize, stepCardSize, stepGap } from "./sizes";

import type { TriggerKind } from "../shared/flow-triggers";
import type { StepPath } from "../shared/step-paths";
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

export const getTriggerNodeId = (kind: TriggerKind) => `trigger:${kind}`;

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

/** A kind of trigger, in the card's ghost look: one that's on, or one that's off, e.g. with every schedule paused. */
export type TriggerCard = {
  kind: TriggerKind;
  /** What the card says under the kind, e.g. "2 on · 1 paused". */
  line: string;
  on: boolean;
};

export type TriggerNode = Node<TriggerCard, "trigger">;

/** A path of a step, and whether a line leaves it. */
export type CardPath = StepPath & { connected: boolean };

export type ActionStepNode = Node<
  StepNodeDataBase & { step: ActionStepDefinition<string>; paths: CardPath[] },
  "step"
>;

export type ForEachStepNode = Node<
  StepNodeDataBase & {
    step: ForEachStepDefinition<string>;
    collapsed: boolean;
    /** What one item of its list is called, e.g. "Supplier". */
    itemName: string;
  },
  "forEach"
>;

export type FlowNode =
  | TriggerNode
  | StartNode
  | ActionStepNode
  | ForEachStepNode;

type ConnectionEdgeData =
  | { kind: "connection"; connection: FlowConnection }
  /** From a trigger to Start; not stored. */
  | { kind: "trigger" }
  /** From Start to a top-level step with nothing before it; not stored. */
  | { kind: "start"; stepId: string }
  /** Between steps inside a for-each step; read-only. */
  | { kind: "inner" };

export type ConnectionEdge = Edge<ConnectionEdgeData, "connection">;

const getConnectionEdgeId = ({ from, to, outputName }: FlowConnection) =>
  `connection:${JSON.stringify([from, to, outputName])}`;

type RunAfterEntry = NonNullable<StepDefinition<string>["runAfter"]>[number];

/** The line a `runAfter` entry draws from: a step, or one of its paths. */
const getLineKey = ({ stepId, outputName }: RunAfterEntry) =>
  JSON.stringify([stepId, outputName]);

const getNestedRunAfter = (steps: StepDefinition<string>[]): RunAfterEntry[] =>
  steps.flatMap((step) => [
    ...(step.runAfter ?? []),
    ...(step.kind === "for-each" ? getNestedRunAfter(step.steps) : []),
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

/** The space between trigger cards, which stack in a column centred on Start. */
const triggerGap = 16;

/**
 * A for-each step's inner steps go where `forEachLayouts` puts them; unsaved positions are drawn at the origin. A
 * top-level for-each step in `collapsedStepIds` is drawn without its steps.
 */
export const getFlowGraph = ({
  flowDefinition,
  problemsByStepId,
  forEachLayouts,
  collapsedStepIds,
  getItemName,
  triggers,
}: Pick<FlowEditorState, "flowDefinition" | "problemsByStepId"> & {
  forEachLayouts: Map<string, ForEachLayout>;
  collapsedStepIds: Set<string>;
  getItemName: (forEachStepId: string) => string;
  /** Drawn a gap to the left of Start, leading into it. */
  triggers: TriggerCard[];
}): { nodes: FlowNode[]; edges: ConnectionEdge[] } => {
  const startPosition = getStartPosition(flowDefinition.steps);
  const nodes: FlowNode[] = [
    ...triggers.map((trigger, index): TriggerNode => ({
      id: getTriggerNodeId(trigger.kind),
      type: "trigger",
      position: {
        x: startPosition.x - stepCardSize.width - stepGap,
        y:
          startPosition.y +
          (index - (triggers.length - 1) / 2) *
            (stepCardSize.height + triggerGap),
      },
      data: trigger,
      draggable: false,
      deletable: false,
      connectable: false,
    })),
    {
      id: startNodeId,
      type: "start",
      position: startPosition,
      data: {},
      draggable: false,
      deletable: false,
    },
  ];
  const edges: ConnectionEdge[] = triggers.map(({ kind }) => ({
    id: `trigger-start:${kind}`,
    type: "connection",
    source: getTriggerNodeId(kind),
    target: startNodeId,
    data: { kind: "trigger" },
    deletable: false,
    selectable: false,
    focusable: false,
  }));

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
        /* Filled in once every line is drawn. */
        nodes.push({
          ...placement,
          type: "step",
          data: { ...data, step, paths: [] },
        });
      } else {
        const layout = forEachLayouts.get(step.stepId);
        const collapsed = !inner && collapsedStepIds.has(step.stepId);
        const size = collapsed ? collapsedForEachSize : layout?.size;

        nodes.push({
          ...placement,
          type: "forEach",
          data: {
            ...data,
            step,
            collapsed,
            itemName: getItemName(step.stepId),
          },
          ...size,
        });

        if (collapsed) {
          const ownLines = new Set((step.runAfter ?? []).map(getLineKey));

          /* Lines to the steps inside a collapsed box go to the box, one per step or path they follow. */
          const linesIn = new Map(
            getNestedRunAfter(step.steps).map((entry) => [
              getLineKey(entry),
              entry,
            ]),
          );

          for (const [key, { stepId: from, outputName }] of linesIn) {
            if (stepIdsInScope.has(from) && !ownLines.has(key)) {
              edges.push({
                id: getConnectionEdgeId({ from, to: step.stepId, outputName }),
                type: "connection",
                source: getStepNodeId(from),
                sourceHandle: outputName,
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

      for (const { stepId: from, outputName } of step.runAfter ?? []) {
        if (!stepIdsInScope.has(from)) {
          continue;
        }

        const connection = { from, to: step.stepId, outputName };

        edges.push({
          id: getConnectionEdgeId(connection),
          type: "connection",
          source: getStepNodeId(from),
          sourceHandle: outputName,
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

  const linesFrom = new Set(
    edges.map(({ source, sourceHandle }) =>
      JSON.stringify([source, sourceHandle]),
    ),
  );

  for (const node of nodes) {
    if (node.type === "step") {
      node.data.paths = getStepPaths(node.data.step).map((path) => ({
        ...path,
        connected: linesFrom.has(JSON.stringify([node.id, path.outputName])),
      }));
    }
  }

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
