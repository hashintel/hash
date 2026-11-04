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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "@xyflow/react/dist/style.css";

import { RightClickMenu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { AddStepMenu } from "./canvas/add-step-menu";
import { CanvasActionsContext } from "./canvas/canvas-actions";
import { CanvasToolbar } from "./canvas/canvas-toolbar";
import { ConnectionEdge } from "./canvas/connection-edge";
import { getContextMenuItems } from "./canvas/context-menu";
import { getFlowGraph, getStepNodeId, startNodeId } from "./canvas/flow-graph";
import { ForEachNode, StartNode, StepNode } from "./canvas/flow-nodes";
import { getFreePosition, layOutFlow } from "./canvas/layout";
import { stepCardSize, stepGap } from "./canvas/sizes";

import type { CanvasActions } from "./canvas/canvas-actions";
import type { CanvasTool } from "./canvas/canvas-toolbar";
import type { AddStepAt, ContextTarget } from "./canvas/context-menu";
import type {
  ConnectionEdge as ConnectionEdgeType,
  FlowNode,
  ForEachLayout,
} from "./canvas/flow-graph";
import type { FlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  Connection,
  EdgeChange,
  EdgeMouseHandler,
  NodeChange,
  NodeMouseHandler,
  OnBeforeDelete,
  OnConnectEnd,
  XYPosition,
} from "@xyflow/react";
import type { MouseEvent as ReactMouseEvent } from "react";

const nodeTypes = {
  start: StartNode,
  step: StepNode,
  forEach: ForEachNode,
};

const edgeTypes = { connection: ConnectionEdge };

const canvas = css({ width: "full", height: "full" });

const getNodeStepId = (node: FlowNode) =>
  node.type === "start" ? null : node.data.step.stepId;

type AddMenuState = {
  anchor: DOMRect;
  addStep: (actionDefinitionId: string) => void;
};

const refuseContextMenu = (event: ReactMouseEvent | MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const cardBeside = (point: XYPosition, side: "left" | "right") => ({
  x: Math.round(side === "right" ? point.x : point.x - stepCardSize.width),
  y: Math.round(point.y - stepCardSize.height / 2),
});

type CanvasProps = {
  editor: FlowEditor;
  selectedStepIds: string[];
  onSelectedStepIdsChange: (stepIds: string[]) => void;
  /** A new object each time, so the same step can be focused twice. */
  focusRequest: { stepId: string } | null;
  collapsedStepIds: Set<string>;
  onToggleCollapsed: (stepId: string) => void;
};

const FlowCanvas = ({
  editor,
  selectedStepIds,
  onSelectedStepIdsChange,
  focusRequest,
  collapsedStepIds,
  onToggleCollapsed,
}: CanvasProps) => {
  const { flowDefinition, problemsByStepId } = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
  );
  const {
    fitView,
    getInternalNode,
    getNodes,
    getZoom,
    screenToFlowPosition,
    setCenter,
  } = useReactFlow<FlowNode, ConnectionEdgeType>();
  const nodesInitialized = useNodesInitialized();

  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<CanvasTool>("select");
  const [forEachLayouts, setForEachLayouts] = useState<Map<
    string,
    ForEachLayout
  > | null>(null);
  /** React Flow needs its measurements passed back with controlled nodes. */
  const [measurements, setMeasurements] = useState(
    () => new Map<string, { width: number; height: number }>(),
  );
  /** Held locally until the drag ends, then saved. */
  const [dragPositions, setDragPositions] = useState(
    () => new Map<string, XYPosition>(),
  );
  const [selectedEdgeIds, setSelectedEdgeIds] = useState(
    () => new Set<string>(),
  );
  const [contextTarget, setContextTarget] = useState<ContextTarget | null>(
    null,
  );
  const contextPointRef = useRef<XYPosition>({ x: 0, y: 0 });
  const [addMenu, setAddMenu] = useState<AddMenuState | null>(null);

  useEffect(() => {
    let cancelled = false;

    layOutFlow(editor.getState().flowDefinition)
      .then(({ positions, forEachLayouts: layouts }) => {
        if (cancelled) {
          return;
        }

        /* On open, only steps with no saved position are placed. */
        const unplacedPositions = new Map<string, XYPosition>();

        for (const step of editor.getState().flowDefinition.steps) {
          const position = positions.get(step.stepId);

          if (!step.position && position) {
            unplacedPositions.set(step.stepId, position);
          }
        }

        editor.placeSteps(unplacedPositions);
        setForEachLayouts(layouts);
      })
      .catch((error: unknown) => {
        /* Layout shouldn't fail. If it does, steps are still drawn where they were saved. */
        Sentry.captureException(error);

        if (!cancelled) {
          setForEachLayouts(new Map());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [editor]);

  const fittedRef = useRef(false);
  useEffect(() => {
    if (nodesInitialized && !fittedRef.current) {
      fittedRef.current = true;
      void fitView({ maxZoom: 1 });
    }
  }, [nodesInitialized, fitView]);

  /* A step picked in the Steps tab replaces any selected connections. */
  const [lastFocusRequest, setLastFocusRequest] = useState(focusRequest);
  if (focusRequest !== lastFocusRequest) {
    setLastFocusRequest(focusRequest);
    setSelectedEdgeIds(new Set());
  }

  /* Retried as nodes appear, until the requested step can be brought into view. */
  const focusedRequestRef = useRef<typeof focusRequest>(null);
  useEffect(() => {
    if (!focusRequest || focusedRequestRef.current === focusRequest) {
      return;
    }

    const node = getInternalNode(getStepNodeId(focusRequest.stepId));

    if (node) {
      focusedRequestRef.current = focusRequest;
      const { x, y } = node.internals.positionAbsolute;

      void setCenter(
        x + (node.measured.width ?? stepCardSize.width) / 2,
        y + (node.measured.height ?? stepCardSize.height) / 2,
        { zoom: getZoom(), duration: 300 },
      );
    }
  }, [focusRequest, nodesInitialized, getInternalNode, getZoom, setCenter]);

  const graph = useMemo(
    () =>
      forEachLayouts
        ? getFlowGraph({
            flowDefinition,
            problemsByStepId,
            forEachLayouts,
            collapsedStepIds,
          })
        : { nodes: [], edges: [] },
    [flowDefinition, problemsByStepId, forEachLayouts, collapsedStepIds],
  );
  /* Connections removed other than by Delete (hover, right-click or a side panel) are no longer selected. */
  useEffect(() => {
    const edgeIds = new Set(graph.edges.map(({ id }) => id));

    setSelectedEdgeIds((current) =>
      current.isSubsetOf(edgeIds) ? current : current.intersection(edgeIds),
    );
  }, [graph.edges]);

  const graphNodesById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );

  /*
   * React Flow redraws a node or edge only when its object changes, so each step below keeps the objects it has nothing
   * to change in. Dragging a card then redraws that card and its lines, not the whole flow.
   */
  const measuredNodes = useMemo(
    () =>
      graph.nodes.map((node) => {
        const measured = measurements.get(node.id);

        return measured ? { ...node, measured } : node;
      }),
    [graph.nodes, measurements],
  );
  const selectionNodes = useMemo(() => {
    const selectedStepIdSet = new Set(selectedStepIds);

    return measuredNodes.map((node) => {
      const stepId = getNodeStepId(node);

      return stepId !== null && selectedStepIdSet.has(stepId)
        ? { ...node, selected: true }
        : node;
    });
  }, [measuredNodes, selectedStepIds]);
  const nodes = useMemo(
    () =>
      selectionNodes.map((node) => {
        const position = dragPositions.get(node.id);

        return position ? { ...node, position } : node;
      }),
    [selectionNodes, dragPositions],
  );
  const edges = useMemo(
    () =>
      graph.edges.map((edge) =>
        selectedEdgeIds.has(edge.id) ? { ...edge, selected: true } : edge,
      ),
    [graph.edges, selectedEdgeIds],
  );

  const topLevelSteps = useMemo(
    () => new Map(flowDefinition.steps.map((step) => [step.stepId, step])),
    [flowDefinition.steps],
  );
  /** `null` for Start and inner steps. */
  const getTopLevelStepId = useCallback(
    (nodeId: string) => {
      const node = graphNodesById.get(nodeId);
      const stepId = node ? getNodeStepId(node) : null;

      return stepId !== null && topLevelSteps.has(stepId) ? stepId : null;
    },
    [graphNodesById, topLevelSteps],
  );
  const getTopLevelStepIds = (stepNodes: FlowNode[]) =>
    stepNodes.flatMap((node) => {
      const stepId = getTopLevelStepId(node.id);

      return stepId === null ? [] : [stepId];
    });

  const selectStep = useCallback(
    (stepId: string) => {
      onSelectedStepIdsChange([stepId]);
      setSelectedEdgeIds(new Set());
    },
    [onSelectedStepIdsChange],
  );

  const getTakenPlaces = useCallback(
    () =>
      getNodes()
        .filter((node) => node.parentId === undefined)
        .map((node) => ({
          position: node.position,
          width: node.measured?.width ?? stepCardSize.width,
          height: node.measured?.height ?? stepCardSize.height,
        })),
    [getNodes],
  );

  const addStepInView = (actionDefinitionId: string) => {
    const bounds = containerRef.current?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    const center = screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    });

    selectStep(
      editor.addStep(actionDefinitionId, {
        position: getFreePosition(
          {
            x: Math.round(center.x - stepCardSize.width / 2),
            y: Math.round(center.y - stepCardSize.height / 2),
          },
          getTakenPlaces(),
        ),
      }),
    );
  };

  /* Kept the same while dragging, as every card and line reads it. */
  const canvasActions = useMemo<CanvasActions>(
    () => ({
      openAddMenuAfter: (anchor, stepId) => {
        const node = getInternalNode(
          stepId === null ? startNodeId : getStepNodeId(stepId),
        );

        if (!node) {
          return;
        }

        const position = getFreePosition(
          {
            x:
              node.position.x +
              (node.measured.width ?? stepCardSize.width) +
              stepGap,
            y: node.position.y,
          },
          getTakenPlaces(),
        );

        setAddMenu({
          anchor: anchor.getBoundingClientRect(),
          addStep: (actionDefinitionId) =>
            selectStep(
              editor.addStep(
                actionDefinitionId,
                stepId === null ? { position } : { after: stepId, position },
              ),
            ),
        });
      },
      removeConnection: editor.removeConnection,
      toggleCollapsed: onToggleCollapsed,
    }),
    [editor, getInternalNode, getTakenPlaces, selectStep, onToggleCollapsed],
  );

  const openAddMenuAtContextPoint = (addStep: AddStepAt) => {
    const point = contextPointRef.current;
    const position = getFreePosition(
      cardBeside(screenToFlowPosition(point), "right"),
      getTakenPlaces(),
    );

    setAddMenu({
      anchor: new DOMRect(point.x, point.y, 0, 0),
      addStep: (actionDefinitionId) => addStep(actionDefinitionId, position),
    });
  };

  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    const nextMeasurements = new Map(measurements);
    const nextDragPositions = new Map(dragPositions);
    const nextSelected = new Set(selectedStepIds);
    let measurementsChanged = false;
    let dragPositionsChanged = false;
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
      } else if (
        change.type === "position" &&
        change.dragging &&
        change.position
      ) {
        nextDragPositions.set(change.id, change.position);
        dragPositionsChanged = true;
      } else if (change.type === "select") {
        const node = graphNodesById.get(change.id);
        const stepId = node ? getNodeStepId(node) : null;

        if (stepId !== null) {
          selectionChanged = true;

          if (change.selected) {
            nextSelected.add(stepId);
          } else {
            nextSelected.delete(stepId);
          }
        }
      }
    }

    /* Unchanged state is kept, so the nodes built from it are too. */
    if (measurementsChanged) {
      setMeasurements(nextMeasurements);
    }

    if (dragPositionsChanged) {
      setDragPositions(nextDragPositions);
    }

    if (selectionChanged) {
      onSelectedStepIdsChange([...nextSelected]);
    }
  };

  const onEdgesChange = (changes: EdgeChange<ConnectionEdgeType>[]) => {
    const nextSelected = new Set(selectedEdgeIds);

    for (const change of changes) {
      if (change.type === "select") {
        if (change.selected) {
          nextSelected.add(change.id);
        } else {
          nextSelected.delete(change.id);
        }
      }
    }

    setSelectedEdgeIds(nextSelected);
  };

  const savePositions = (draggedNodes: FlowNode[]) => {
    for (const node of draggedNodes) {
      const stepId = getTopLevelStepId(node.id);

      if (stepId !== null) {
        editor.moveStep(stepId, {
          x: Math.round(node.position.x),
          y: Math.round(node.position.y),
        });
      }
    }

    setDragPositions(new Map());
  };

  const isValidConnection = ({
    source,
    target,
  }: Pick<Connection, "source" | "target">) => {
    const from = getTopLevelStepId(source);
    const to = getTopLevelStepId(target);

    return (
      from !== null &&
      to !== null &&
      from !== to &&
      !topLevelSteps.get(to)?.runAfter?.some(({ stepId }) => stepId === from)
    );
  };

  const onConnectEnd: OnConnectEnd = (
    event,
    { isValid, toNode, fromNode, fromHandle },
  ) => {
    if (isValid || toNode || !fromNode || !fromHandle) {
      return;
    }

    const fromStepId = getTopLevelStepId(fromNode.id);

    if (fromNode.id !== startNodeId && fromStepId === null) {
      return;
    }

    const point = "changedTouches" in event ? event.changedTouches[0] : event;

    if (!point) {
      return;
    }

    const fromOutput = fromHandle.type === "source";
    const position = getFreePosition(
      cardBeside(
        screenToFlowPosition({ x: point.clientX, y: point.clientY }),
        fromOutput ? "right" : "left",
      ),
      getTakenPlaces(),
    );

    setAddMenu({
      anchor: new DOMRect(point.clientX, point.clientY, 0, 0),
      addStep: (actionDefinitionId) => {
        if (fromStepId === null) {
          selectStep(editor.addStep(actionDefinitionId, { position }));
        } else if (fromOutput) {
          selectStep(
            editor.addStep(actionDefinitionId, {
              after: fromStepId,
              position,
            }),
          );
        } else {
          const stepId = editor.addStep(actionDefinitionId, { position });

          editor.addConnection({ from: stepId, to: fromStepId });
          selectStep(stepId);
        }
      },
    });
  };

  /* Deletes go through the editor; React Flow never removes anything itself. */
  const onBeforeDelete: OnBeforeDelete<FlowNode, ConnectionEdgeType> = ({
    nodes: deletedNodes,
    edges: deletedEdges,
  }) => {
    const removedStepIds = new Set(getTopLevelStepIds(deletedNodes));

    for (const { data } of deletedEdges) {
      if (
        data?.kind === "connection" &&
        !removedStepIds.has(data.connection.from) &&
        !removedStepIds.has(data.connection.to)
      ) {
        editor.removeConnection(data.connection);
      }
    }

    for (const stepId of removedStepIds) {
      editor.removeStep(stepId);
    }

    onSelectedStepIdsChange(
      selectedStepIds.filter((stepId) => !removedStepIds.has(stepId)),
    );
    setSelectedEdgeIds(new Set());

    return Promise.resolve(false);
  };

  const organize = async () => {
    const { flowDefinition: laidOut } = editor.getState();
    const { positions, forEachLayouts: layouts } = await layOutFlow(
      laidOut,
      collapsedStepIds,
    );

    /* An edit made while laying out would be overwritten, or name a deleted step. */
    if (editor.getState().flowDefinition !== laidOut) {
      return;
    }

    for (const [stepId, position] of positions) {
      editor.moveStep(stepId, position);
    }

    setForEachLayouts((current) => new Map([...(current ?? []), ...layouts]));
    requestAnimationFrame(() => {
      void fitView({ maxZoom: 1, duration: 300 });
    });
  };

  const rememberContextPoint = (event: ReactMouseEvent | MouseEvent) => {
    contextPointRef.current = { x: event.clientX, y: event.clientY };
  };

  /* Every card and line is given these, so they are kept the same while dragging. */
  const onNodeContextMenu = useCallback<NodeMouseHandler<FlowNode>>(
    (event, node) => {
      const stepId = getTopLevelStepId(node.id);

      if (stepId === null) {
        refuseContextMenu(event);
        return;
      }

      contextPointRef.current = { x: event.clientX, y: event.clientY };

      const handle =
        event.target instanceof Element
          ? event.target.closest(".react-flow__handle")
          : null;

      setContextTarget(
        handle
          ? {
              kind: "port",
              stepId,
              side: handle.classList.contains("source") ? "output" : "input",
            }
          : { kind: "step", stepId },
      );
    },
    [getTopLevelStepId],
  );
  const onEdgeContextMenu = useCallback<EdgeMouseHandler<ConnectionEdgeType>>(
    (event, edge) => {
      if (edge.data?.kind === "connection") {
        setContextTarget({
          kind: "connection",
          connection: edge.data.connection,
        });
      } else if (edge.data?.kind === "start") {
        setContextTarget({ kind: "start-line", stepId: edge.data.stepId });
      } else {
        refuseContextMenu(event);
        return;
      }

      contextPointRef.current = { x: event.clientX, y: event.clientY };
    },
    [],
  );

  return (
    <CanvasActionsContext value={canvasActions}>
      <div ref={containerRef} className={canvas}>
        <RightClickMenu
          items={getContextMenuItems({
            target: contextTarget,
            editor,
            topLevelSteps,
            openAddMenu: openAddMenuAtContextPoint,
            selectStep,
          })}
        >
          <ReactFlow<FlowNode, ConnectionEdgeType>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={(_event, _node, draggedNodes) =>
              savePositions(draggedNodes)
            }
            onSelectionDragStop={(_event, draggedNodes) =>
              savePositions(draggedNodes)
            }
            isValidConnection={isValidConnection}
            onConnect={({ source, target }) => {
              const from = getTopLevelStepId(source);
              const to = getTopLevelStepId(target);

              if (from !== null && to !== null) {
                editor.addConnection({ from, to });
              }
            }}
            onConnectEnd={onConnectEnd}
            connectOnClick={false}
            connectionLineStyle={{ stroke: "var(--colors-blue-bd-strong)" }}
            onBeforeDelete={onBeforeDelete}
            deleteKeyCode={["Backspace", "Delete"]}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onSelectionContextMenu={(event, selectedNodes) => {
              rememberContextPoint(event);
              setContextTarget({
                kind: "selection",
                stepIds: getTopLevelStepIds(selectedNodes),
              });
            }}
            onPaneContextMenu={refuseContextMenu}
            panOnDrag={tool === "hand" ? true : [1]}
            selectionOnDrag={tool === "select"}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} />
            <MiniMap position="top-right" pannable zoomable />
            <Panel position="bottom-center">
              <CanvasToolbar
                tool={tool}
                onToolChange={setTool}
                onAddStep={addStepInView}
                onOrganize={() => {
                  void organize();
                }}
                canOrganize={flowDefinition.steps.length > 0}
              />
            </Panel>
          </ReactFlow>
        </RightClickMenu>
        {addMenu && (
          <AddStepMenu
            anchor={addMenu.anchor}
            onPick={addMenu.addStep}
            onClose={() => setAddMenu(null)}
          />
        )}
      </div>
    </CanvasActionsContext>
  );
};

export const Canvas = (props: CanvasProps) => (
  <ReactFlowProvider>
    <FlowCanvas {...props} />
  </ReactFlowProvider>
);
