import { getStepsBefore } from "../shared/step-order";
import { getStepPaths } from "../shared/step-paths";
import {
  collapsedForEachSize,
  forEachBoxPadding,
  getForEachBoxSize,
  getStepCardSize,
  stepCardSize,
  stepGap,
} from "./sizes";

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

/** Where an automatic layout puts a box's steps, for those with no saved place. */
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
  /** Whether the run is still going. */
  live: boolean;
};

type StepNodeDataBase = {
  problems: FlowDefinitionDiagnosticWithStepId[];
  /** Inside a for-each step. */
  inner: boolean;
  run?: CardRun;
};

export type StartNode = Node<{ run?: CardRun }, "start">;

/**
 * A kind of trigger, in the card's ghost look: one that's on, or one that's off, e.g. with every schedule paused. In a
 * run, the trigger that started it, drawn as a step that ran.
 */
export type TriggerCard = {
  kind: TriggerKind;
  /** What the card says under the kind, e.g. "2 on · 1 paused". */
  line: string;
  on: boolean;
  run?: CardRun;
};

export type TriggerNode = Node<TriggerCard, "trigger">;

/** A path of a step, and whether a line leaves it. */
export type CardPath = StepPath & { connected: boolean };

export type ActionStepNode = Node<
  StepNodeDataBase & {
    step: ActionStepDefinition<string>;
    paths: CardPath[];
    /** Whether a line leaves the step itself, not one of its paths: the step after it runs on either path. */
    lineFromStep?: boolean;
  },
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
  /** From a trigger to Start; not stored. Dashed from a ghost. */
  | { kind: "trigger"; ghost: boolean }
  /** From Start to a top-level step with nothing before it; not stored. */
  | { kind: "start"; stepId: string }
  /** Into a collapsed box, for the steps inside it that run after a step outside; read-only. */
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

/** Where a step inside a box goes when neither it nor a layout gives it a place: the box's first. */
export const firstPlaceInBox = {
  x: forEachBoxPadding.side,
  y: forEachBoxPadding.header,
};

const getInnerPosition = (
  step: StepDefinition<string>,
  layout: ForEachLayout | undefined,
) => step.position ?? layout?.positions.get(step.stepId) ?? firstPlaceInBox;

/** A card's size; a box inside a box, which a flow can't have, is drawn collapsed. */
export const getCardSize = (step: StepDefinition<string>) =>
  step.kind === "action"
    ? getStepCardSize(getStepPaths(step).length)
    : collapsedForEachSize;

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
 * A step inside a for-each step goes where it was saved, relative to its box, else where `forEachLayouts` puts it. A
 * box is sized to the steps inside it. A top-level for-each step in `collapsedStepIds` is drawn without its steps.
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
  const edges: ConnectionEdge[] = triggers.map(({ kind, run }) => ({
    id: `trigger-start:${kind}`,
    type: "connection",
    source: getTriggerNodeId(kind),
    target: startNodeId,
    data: { kind: "trigger", ghost: run === undefined },
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
      const position = parent
        ? getInnerPosition(step, parent.layout)
        : (step.position ?? { x: 0, y: 0 });
      const placement = {
        id,
        position,
        ...(parent && { parentId: getStepNodeId(parent.stepId) }),
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
        const size = collapsed
          ? collapsedForEachSize
          : getForEachBoxSize(
              step.steps.map((innerStep) => ({
                position: getInnerPosition(innerStep, layout),
                ...getCardSize(innerStep),
              })),
            );

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
          data: { kind: "connection", connection },
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
      node.data.lineFromStep = linesFrom.has(JSON.stringify([node.id, null]));
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
