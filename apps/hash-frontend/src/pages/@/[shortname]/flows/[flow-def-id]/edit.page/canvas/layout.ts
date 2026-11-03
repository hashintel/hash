import ELK from "elkjs/lib/elk.bundled.js";

import { getStepsBefore } from "../shared/step-order";
import {
  forEachBoxPadding,
  getStartPosition,
  startNodeId,
  stepCardSize,
  stepGap,
} from "./flow-graph";

import type { ForEachLayout } from "./flow-graph";
import type { StepPosition } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  FlowDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

/** Ids for elk, which needs every node's id to be unique, unlike Start's and the steps' ids together. */
const startElkId = `start:${startNodeId}`;
const getStepElkId = (stepId: string) => `step:${stepId}`;

const layoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.layered.spacing.nodeNodeBetweenLayers": String(stepGap),
  "elk.spacing.nodeNode": "32",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
};

const getElkEdges = (
  steps: StepDefinition<string>[],
  withStart: boolean,
): ElkExtendedEdge[] =>
  [...getStepsBefore(steps)]
    .flatMap(([stepId, stepIdsBefore]) =>
      stepIdsBefore.length === 0
        ? withStart
          ? [{ from: startElkId, to: stepId }]
          : []
        : stepIdsBefore.map((from) => ({
            from: getStepElkId(from),
            to: stepId,
          })),
    )
    .map(({ from, to }, index) => ({
      id: `edge:${index}`,
      sources: [from],
      targets: [getStepElkId(to)],
    }));

const getElkNodes = (steps: StepDefinition<string>[]): ElkNode[] =>
  steps.map((step) =>
    step.kind === "action"
      ? { id: getStepElkId(step.stepId), ...stepCardSize }
      : {
          id: getStepElkId(step.stepId),
          children: getElkNodes(step.steps),
          edges: getElkEdges(step.steps, false),
          layoutOptions: {
            ...layoutOptions,
            "elk.padding": `[top=${forEachBoxPadding.header},left=${forEachBoxPadding.side},bottom=${forEachBoxPadding.side},right=${forEachBoxPadding.side}]`,
            "elk.nodeSize.constraints": "MINIMUM_SIZE",
            "elk.nodeSize.minimum": `(${stepCardSize.width}, ${stepCardSize.height + forEachBoxPadding.header})`,
          },
        },
  );

/** Reads where elk put each of `steps`, and the layout of each for-each step's box, at any depth. */
const readLayout = (
  steps: StepDefinition<string>[],
  elkNodes: ElkNode[],
  forEachLayouts: Map<string, ForEachLayout>,
): Map<string, StepPosition> => {
  const elkNodesById = new Map(elkNodes.map((node) => [node.id, node]));
  const positions = new Map<string, StepPosition>();

  for (const step of steps) {
    const elkNode = elkNodesById.get(getStepElkId(step.stepId));

    positions.set(step.stepId, { x: elkNode?.x ?? 0, y: elkNode?.y ?? 0 });

    if (step.kind === "for-each") {
      forEachLayouts.set(step.stepId, {
        size: {
          width: elkNode?.width ?? stepCardSize.width,
          height: elkNode?.height ?? stepCardSize.height,
        },
        positions: readLayout(
          step.steps,
          elkNode?.children ?? [],
          forEachLayouts,
        ),
      });
    }
  }

  return positions;
};

/**
 * Where to put a new step's card so that it covers none of `taken`: at `position`, or as far below it as needed.
 */
export const getFreePosition = (
  position: StepPosition,
  taken: { position: StepPosition; width: number; height: number }[],
): StepPosition => {
  const covered = taken.filter(
    (rect) =>
      position.x < rect.position.x + rect.width &&
      rect.position.x < position.x + stepCardSize.width &&
      position.y < rect.position.y + rect.height &&
      rect.position.y < position.y + stepCardSize.height,
  );

  return covered.length === 0
    ? position
    : getFreePosition(
        {
          x: position.x,
          y:
            Math.max(...covered.map((rect) => rect.position.y + rect.height)) +
            stepGap / 2,
        },
        taken,
      );
};

/**
 * The top-level steps that automatic layout places when a flow is opened: those with no saved position. In practice
 * either every step has one, as each step added in the editor does, or none has, as in flows made before it.
 */
export const getStepsToLayOut = (flowDefinition: FlowDefinition<string>) =>
  flowDefinition.steps
    .filter(({ position }) => !position)
    .map(({ stepId }) => stepId);

/**
 * Lays a flow out from left to right, each step a gap after the steps it runs after, counting data links as well as
 * connections. Returns a position for every top-level step, placed so that Start stays where it is, and where to draw
 * each for-each step's steps in its box, which are never saved.
 */
export const layOutFlow = async (
  flowDefinition: FlowDefinition<string>,
): Promise<{
  positions: Map<string, StepPosition>;
  forEachLayouts: Map<string, ForEachLayout>;
}> => {
  const { steps } = flowDefinition;

  const graph = await elk.layout({
    id: "root",
    layoutOptions,
    children: [{ id: startElkId, ...stepCardSize }, ...getElkNodes(steps)],
    edges: getElkEdges(steps, true),
  });

  const forEachLayouts = new Map<string, ForEachLayout>();
  const positions = readLayout(steps, graph.children ?? [], forEachLayouts);

  const start = graph.children?.find(({ id }) => id === startElkId);
  const startPosition = getStartPosition(steps);
  const offset = {
    x: startPosition.x - (start?.x ?? 0),
    y: startPosition.y - (start?.y ?? 0),
  };

  for (const [stepId, { x, y }] of positions) {
    positions.set(stepId, {
      x: Math.round(x + offset.x),
      y: Math.round(y + offset.y),
    });
  }

  return { positions, forEachLayouts };
};
