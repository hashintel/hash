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

import { css } from "@hashintel/ds-helpers/css";

import { notReachedMark, startMark } from "../shared/step-states";
import { CanvasActionsContext } from "./canvas-actions";
import { CanvasToolbar } from "./canvas-toolbar";
import { ConnectionEdge } from "./connection-edge";
import { getFlowGraph } from "./flow-graph";
import { ForEachNode, StartNode, StepNode } from "./flow-nodes";
import { layOutFlow } from "./layout";
import { useStepFocus } from "./use-step-focus";

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
};

const FlowRunCanvas = ({
  flowDefinition,
  marks,
  selectedStepIds,
  onSelectionChange,
  focusRequest,
  collapsedStepIds,
  onToggleCollapsed,
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

  const fittedRef = useRef(false);
  useEffect(() => {
    if (nodesInitialized && !fittedRef.current) {
      fittedRef.current = true;
      void fitView({ maxZoom: 1 });
    }
  }, [nodesInitialized, fitView]);

  useStepFocus(focusRequest, 0);

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
        ...(measured && { measured }),
      };
    });
  }, [graph.nodes, marks, featuredStepIds, selectedStepIds, measurements]);

  const edges = useMemo(
    () =>
      graph.edges.map((edge) => ({
        ...edge,
        selectable: false,
        focusable: false,
      })),
    [graph.edges],
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
          <MiniMap position="top-right" pannable zoomable />
        </ReactFlow>
        <Panel position="bottom-center">
          <CanvasToolbar
            tool={tool}
            onToolChange={setTool}
            editing={null}
            fitPadding={undefined}
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
