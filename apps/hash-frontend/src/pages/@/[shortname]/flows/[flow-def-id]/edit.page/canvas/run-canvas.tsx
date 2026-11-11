import * as Sentry from "@sentry/nextjs";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";

import { css, cx } from "@hashintel/ds-helpers/css";

import { notReachedMark, startMark } from "../shared/step-states";
import { CanvasActionsContext } from "./canvas-actions";
import { CanvasToolbar } from "./canvas-toolbar";
import { ConnectionEdge } from "./connection-edge";
import { getFlowGraph } from "./flow-graph";
import { ForEachNode, StartNode, StepNode } from "./flow-nodes";
import { layOutFlow } from "./layout";
import { getUndimmedNodeIds } from "./undimmed-nodes";
import { useSelectedStepInView, useStepFocus } from "./use-step-focus";

import type { StepRunMark } from "../shared/step-states";
import type { CanvasActions } from "./canvas-actions";
import type { CanvasTool } from "./canvas-toolbar";
import type {
  CardRun,
  ConnectionEdge as ConnectionEdgeType,
  FlowNode,
  ForEachLayout,
} from "./flow-graph";
import type { StepPosition } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { NodeChange } from "@xyflow/react";

const nodeTypes = {
  start: StartNode,
  step: StepNode,
  forEach: ForEachNode,
};

const edgeTypes = { connection: ConnectionEdge };

const canvas = css({ position: "relative", width: "full", height: "full" });
/* While a step is highlighted, the rest fade back, so it stands out where it is, and fade in again after. */
const dimmable = css({ transition: "opacity", transitionDuration: "fast" });
const dimmed = css({ opacity: "0.3" });

const startRun: CardRun = { mark: startMark, featured: false };

const withRun = (node: FlowNode, run: CardRun): FlowNode => {
  switch (node.type) {
    case "start":
      return { ...node, data: { ...node.data, run }, selectable: false };
    case "step":
      return { ...node, data: { ...node.data, run } };
    case "forEach":
      return { ...node, data: { ...node.data, run } };
  }
};

type RunCanvasProps = {
  /** The flow as the run ran it. */
  flowDefinition: FlowDefinition<string>;
  /** Each step's mark in the run, by step id. A step with none is not reached. */
  marks: Map<string, StepRunMark>;
  selectedStepIds: string[];
  onSelectionChange: (stepIds: string[]) => void;
  /** A new object each time, so the same step can be focused twice. */
  focusRequest: { stepId: string } | null;
  collapsedStepIds: Set<string>;
  onToggleCollapsed: (stepId: string) => void;
  /**
   * A step to show apart from the rest, e.g. one using the selected step's output: every other step is dimmed but
   * those selected.
   */
  highlightedStepId: string | null;
  /** How much of the canvas's right edge a panel covers, in pixels. */
  coveredRight: number;
};

const FlowRunCanvas = ({
  flowDefinition,
  marks,
  selectedStepIds,
  onSelectionChange,
  focusRequest,
  collapsedStepIds,
  onToggleCollapsed,
  highlightedStepId,
  coveredRight,
}: RunCanvasProps) => {
  const { fitView } = useReactFlow<FlowNode, ConnectionEdgeType>();
  const nodesInitialized = useNodesInitialized();
  const [tool, setTool] = useState<CanvasTool>("select");
  const [layout, setLayout] = useState<{
    positions: Map<string, StepPosition>;
    forEachLayouts: Map<string, ForEachLayout>;
  } | null>(null);
  /** React Flow needs its measurements passed back with controlled nodes. */
  const [measurements, setMeasurements] = useState(
    () => new Map<string, { width: number; height: number }>(),
  );

  useEffect(() => {
    let cancelled = false;

    layOutFlow(flowDefinition)
      .then((laidOut) => {
        if (!cancelled) {
          setLayout(laidOut);
        }
      })
      .catch((error: unknown) => {
        /* Layout shouldn't fail. If it does, steps are still drawn where they were saved. */
        Sentry.captureException(error);

        if (!cancelled) {
          setLayout({ positions: new Map(), forEachLayouts: new Map() });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [flowDefinition]);

  /* As in the editor: fitting leaves the cards clear of the panel. */
  const fitPadding = useMemo(
    () =>
      coveredRight > 0
        ? ({ x: "5%", y: "5%", right: `${coveredRight + 24}px` } as const)
        : undefined,
    [coveredRight],
  );

  const fittedRef = useRef(false);
  useEffect(() => {
    if (nodesInitialized && !fittedRef.current) {
      fittedRef.current = true;
      void fitView({ maxZoom: 1, padding: fitPadding });
    }
  }, [nodesInitialized, fitView, fitPadding]);

  useStepFocus(focusRequest, coveredRight);
  useSelectedStepInView(selectedStepIds, coveredRight);

  const graph = useMemo(() => {
    if (!layout) {
      return { nodes: [], edges: [] };
    }

    /* Steps the editor never placed go where it would place them on opening the flow. */
    const placedDefinition = {
      ...flowDefinition,
      steps: flowDefinition.steps.map((step) => ({
        ...step,
        position: step.position ?? layout.positions.get(step.stepId),
      })),
    };

    return getFlowGraph({
      flowDefinition: placedDefinition,
      problemsByStepId: new Map(),
      forEachLayouts: layout.forEachLayouts,
      collapsedStepIds,
    });
  }, [flowDefinition, layout, collapsedStepIds]);

  const featuredStepIds = useMemo(
    () => new Set(flowDefinition.outputs.map(({ stepId }) => stepId)),
    [flowDefinition.outputs],
  );

  /* While a step is highlighted, it and the selected steps stay as they are, so both ends of what links them show. */
  const undimmedNodeIds = useMemo(
    () =>
      highlightedStepId === null
        ? null
        : getUndimmedNodeIds({
            stepIds: [highlightedStepId, ...selectedStepIds],
            steps: flowDefinition.steps,
            collapsedStepIds,
            nodes: graph.nodes,
          }),
    [
      highlightedStepId,
      selectedStepIds,
      flowDefinition.steps,
      collapsedStepIds,
      graph.nodes,
    ],
  );

  const nodes = useMemo(() => {
    const selectedStepIdSet = new Set(selectedStepIds);

    return graph.nodes.map((node) => {
      const stepId = node.type === "start" ? null : node.data.step.stepId;
      const measured = measurements.get(node.id);

      return {
        ...withRun(
          node,
          stepId === null
            ? startRun
            : {
                mark: marks.get(stepId) ?? notReachedMark,
                featured: featuredStepIds.has(stepId),
              },
        ),
        draggable: false,
        deletable: false,
        connectable: false,
        selected: stepId !== null && selectedStepIdSet.has(stepId),
        className: cx(
          dimmable,
          undimmedNodeIds !== null && !undimmedNodeIds.has(node.id) && dimmed,
        ),
        ...(measured && { measured }),
      };
    });
  }, [
    graph.nodes,
    marks,
    featuredStepIds,
    selectedStepIds,
    undimmedNodeIds,
    measurements,
  ]);

  const edges = useMemo(
    () =>
      graph.edges.map((edge) => ({
        ...edge,
        selectable: false,
        focusable: false,
        /* A line stays as it is only between two steps that do. */
        className: cx(
          dimmable,
          undimmedNodeIds !== null &&
            !(
              undimmedNodeIds.has(edge.source) &&
              undimmedNodeIds.has(edge.target)
            ) &&
            dimmed,
        ),
      })),
    [graph.edges, undimmedNodeIds],
  );

  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    const nextMeasurements = new Map(measurements);
    const nextSelected = new Set(selectedStepIds);
    let measurementsChanged = false;
    let selectionChanged = false;

    for (const change of changes) {
      if (change.type === "dimensions" && change.dimensions) {
        const measured = measurements.get(change.id);

        if (
          measured?.width !== change.dimensions.width ||
          measured.height !== change.dimensions.height
        ) {
          nextMeasurements.set(change.id, change.dimensions);
          measurementsChanged = true;
        }
      } else if (change.type === "select") {
        const node = graph.nodes.find(({ id }) => id === change.id);

        if (node && node.type !== "start") {
          selectionChanged = true;

          if (change.selected) {
            nextSelected.add(node.data.step.stepId);
          } else {
            nextSelected.delete(node.data.step.stepId);
          }
        }
      }
    }

    if (measurementsChanged) {
      setMeasurements(nextMeasurements);
    }

    if (selectionChanged) {
      onSelectionChange([...nextSelected]);
    }
  };

  const canvasActions = useMemo<CanvasActions>(
    () => ({ editing: null, toggleCollapsed: onToggleCollapsed }),
    [onToggleCollapsed],
  );

  return (
    <CanvasActionsContext value={canvasActions}>
      <div className={canvas}>
        <ReactFlow<FlowNode, ConnectionEdgeType>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          panOnDrag={tool === "hand" ? true : [1]}
          selectionOnDrag={tool === "select"}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} />
          <MiniMap
            position="top-right"
            pannable
            zoomable
            style={{ marginRight: coveredRight + 15 }}
          />
        </ReactFlow>
        <Panel position="bottom-center">
          <CanvasToolbar
            tool={tool}
            onToolChange={setTool}
            editing={null}
            fitPadding={fitPadding}
          />
        </Panel>
      </div>
    </CanvasActionsContext>
  );
};

/** A run drawn on its flow's canvas, read-only: each card shows its step's state in the run. */
export const RunCanvas = (props: RunCanvasProps) => (
  <ReactFlowProvider>
    <FlowRunCanvas {...props} />
  </ReactFlowProvider>
);
