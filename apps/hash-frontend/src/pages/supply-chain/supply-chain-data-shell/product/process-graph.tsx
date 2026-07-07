import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  Panel,
  type Node,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
  MarkerType,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { StepNode } from "./process-graph/step-node";

import type { GraphData, GraphNode, GraphEdge } from "../../shared/types";

const nodeTypes: NodeTypes = {
  stepNode: StepNode as unknown as NodeTypes[string],
};

const canvasShell = css({
  w: "full",
  borderRadius: "lg",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  bg: "bgSolid.min",
});
const canvasFull = css({ h: "[100vh]" });
const canvasNormal = css({ h: "full", minH: "[360px]" });
const exitButton = css({
  bg: "[rgba(255,255,255,0.9)]",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "bd.subtle",
  boxShadow: "sm",
  borderRadius: "md",
  px: "3",
  py: "1.5",
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  cursor: "pointer",
  _hover: { bg: "bgSolid.min" },
});

const NODE_WIDTH = 240;
const NODE_HEIGHT = 110;

const elk = new ELK();

interface LayoutResult {
  positions: Record<string, { x: number; y: number }>;
  minY: number;
  maxY: number;
}

async function computeLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
): Promise<LayoutResult> {
  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "elk.layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "30",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    },
    children: graphNodes.map((gn) => ({
      id: gn.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: graphEdges.map((event, index) => ({
      id: `e-${index}`,
      sources: [event.source],
      targets: [event.target],
    })),
  };

  const result = await elk.layout(elkGraph);

  const positions: Record<string, { x: number; y: number }> = {};
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const child of result.children ?? []) {
    const xValue = child.x ?? 0;
    const yValue = child.y ?? 0;
    positions[child.id] = { x: xValue, y: yValue };
    minY = Math.min(minY, yValue);
    maxY = Math.max(maxY, yValue + NODE_HEIGHT);
  }

  return { positions, minY, maxY };
}

function computeViewport(minY: number, maxY: number, containerH: number) {
  const graphH = maxY - minY;
  const zoom = Math.min(containerH / (graphH + 40), 1);
  const scaledH = graphH * zoom;
  return {
    x: 10,
    y: (containerH - scaledH) / 2 - minY * zoom,
    zoom,
  };
}

interface ProcessGraphProps {
  graph: GraphData;
  onStepClick: (stepId: string) => void;
  timeRange?: string;
}

export const ProcessGraph = ({
  graph,
  onStepClick,
  timeRange,
}: ProcessGraphProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [containerHeight, setContainerHeight] = useState(900);

  const [layout, setLayout] = useState<LayoutResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void computeLayout(graph.nodes, graph.edges).then((result) => {
      if (!cancelled) {
        setLayout(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [graph]);

  const flowEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((event, index) => ({
        id: `e-${index}`,
        source: event.source,
        target: event.target,
        type: "smoothstep",
        animated: false,
        style: { stroke: "#cbd5e1", strokeWidth: 1.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "#cbd5e1",
          width: 14,
          height: 14,
        },
      })),
    [graph.edges],
  );

  const initialNodes: Node[] = useMemo(() => {
    if (!layout) {
      return [];
    }
    return graph.nodes.map((gn: GraphNode) => ({
      id: gn.id,
      type: "stepNode",
      position: layout.positions[gn.id] ?? { x: 0, y: 0 },
      data: { ...gn, onClick: onStepClick, timeRange },
      initialWidth: NODE_WIDTH,
      initialHeight: NODE_HEIGHT,
    }));
  }, [graph.nodes, layout, onStepClick, timeRange]);

  const defaultViewport = useMemo(
    () =>
      layout
        ? computeViewport(layout.minY, layout.maxY, containerHeight)
        : { x: 10, y: 10, zoom: 1 },
    [containerHeight, layout],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes((prev) => {
      const posMap = new Map(prev.map((count) => [count.id, count.position]));
      return initialNodes.map((count) => ({
        ...count,
        position: posMap.get(count.id) ?? count.position,
      }));
    });
  }, [initialNodes, setNodes]);

  useEffect(() => {
    if (!layout || !rfRef.current) {
      return;
    }
    const vp = computeViewport(layout.minY, layout.maxY, containerHeight);
    void rfRef.current.setViewport(vp, { duration: 0 });
  }, [containerHeight, layout]);

  const onAutoLayout = useCallback(async () => {
    const freshLayout = await computeLayout(graph.nodes, graph.edges);
    setNodes((prev) =>
      prev.map((count) => ({
        ...count,
        position: freshLayout.positions[count.id] ?? count.position,
      })),
    );
    const containerH =
      containerRef.current?.getBoundingClientRect().height ?? 900;
    const vp = computeViewport(freshLayout.minY, freshLayout.maxY, containerH);
    void rfRef.current?.setViewport(vp, { duration: 300 });
  }, [graph, setNodes]);

  const onToggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const onFullscreenChange = useCallback(() => {
    setIsFullscreen(!!document.fullscreenElement);
  }, []);

  const containerCallbackRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        (
          containerRef as React.MutableRefObject<HTMLDivElement | null>
        ).current = el;
        el.addEventListener("fullscreenchange", onFullscreenChange);
      }
    },
    [onFullscreenChange],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    const updateHeight = () => {
      const nextHeight = el.getBoundingClientRect().height;
      if (nextHeight > 0) {
        setContainerHeight(nextHeight);
      }
    };
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfRef.current = instance;
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onStepClick(node.id);
    },
    [onStepClick],
  );

  return (
    <div
      ref={containerCallbackRef}
      className={cx(canvasShell, isFullscreen ? canvasFull : canvasNormal)}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onInit={onInit}
        nodeTypes={nodeTypes}
        defaultViewport={defaultViewport}
        minZoom={0.1}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#f1f5f9" gap={20} />
        <Controls showInteractive={false} showFitView={false}>
          <ControlButton onClick={onAutoLayout} title="Auto-layout">
            <Icon name="grid" size="sm" />
          </ControlButton>
          <ControlButton
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Icon name={isFullscreen ? "collapse" : "expand"} size="sm" />
          </ControlButton>
        </Controls>
        {isFullscreen && (
          <Panel position="top-right">
            <button
              type="button"
              onClick={onToggleFullscreen}
              className={exitButton}
            >
              Exit fullscreen (Esc)
            </button>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
};
