import ELK from "elkjs/lib/elk.bundled.js";

import { getStepsBefore } from "../shared/step-order";
import {
  collapsedForEachSize,
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

/** elk needs ids unique across Start and steps. */
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

const getElkNodes = (
  steps: StepDefinition<string>[],
  collapsedStepIds: Set<string>,
): ElkNode[] =>
  steps.map((step) =>
    step.kind === "action"
      ? { id: getStepElkId(step.stepId), ...stepCardSize }
      : collapsedStepIds.has(step.stepId)
        ? { id: getStepElkId(step.stepId), ...collapsedForEachSize }
        : {
            id: getStepElkId(step.stepId),
            children: getElkNodes(step.steps, new Set()),
            edges: getElkEdges(step.steps, false),
            layoutOptions: {
              ...layoutOptions,
              "elk.padding": `[top=${forEachBoxPadding.header},left=${forEachBoxPadding.side},bottom=${forEachBoxPadding.side},right=${forEachBoxPadding.side}]`,
              "elk.nodeSize.constraints": "MINIMUM_SIZE",
              "elk.nodeSize.minimum": `(${stepCardSize.width}, ${stepCardSize.height + forEachBoxPadding.header})`,
            },
          },
  );

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

    /* A collapsed for-each step has no children here, and keeps the layout it had. */
    if (step.kind === "for-each" && elkNode?.children) {
      forEachLayouts.set(step.stepId, {
        size: {
          width: elkNode.width ?? stepCardSize.width,
          height: elkNode.height ?? stepCardSize.height,
        },
        positions: readLayout(step.steps, elkNode.children, forEachLayouts),
      });
    }
  }

  return positions;
};

/** `position`, or as far below it as needed for a new card to cover none of `taken`. */
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
 * Lays a flow out left to right, counting data links as well as connections, keeping Start where it is. Inner steps'
 * places are returned in `forEachLayouts` and never saved, except for the top-level for-each steps in
 * `collapsedStepIds`, which are laid out at their collapsed size.
 */
export const layOutFlow = async (
  flowDefinition: FlowDefinition<string>,
  collapsedStepIds = new Set<string>(),
): Promise<{
  positions: Map<string, StepPosition>;
  forEachLayouts: Map<string, ForEachLayout>;
}> => {
  const { steps } = flowDefinition;

  const graph = await elk.layout({
    id: "root",
    layoutOptions,
    children: [
      { id: startElkId, ...stepCardSize },
      ...getElkNodes(steps, collapsedStepIds),
    ],
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
