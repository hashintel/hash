import { Box } from "@mui/material";
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
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "@xyflow/react/dist/style.css";

import { RightClickMenu } from "@hashintel/ds-components";

import { AddStepMenu } from "./canvas/add-step-menu";
import { CanvasActionsContext } from "./canvas/canvas-actions";
import { CanvasToolbar } from "./canvas/canvas-toolbar";
import { ConnectionEdge } from "./canvas/connection-edge";
import {
  getFlowGraph,
  getStepNodeId,
  startNodeId,
  stepCardSize,
  stepGap,
} from "./canvas/flow-graph";
import { ForEachNode, StartNode, StepNode } from "./canvas/flow-nodes";
import { getFreePosition, layOutFlow } from "./canvas/layout";
import { stepNoun } from "./shared/step-display";

import type { CanvasActions } from "./canvas/canvas-actions";
import type { CanvasTool } from "./canvas/canvas-toolbar";
import type {
  ConnectionEdge as ConnectionEdgeType,
  FlowNode,
  ForEachLayout,
} from "./canvas/flow-graph";
import type { MenuItem } from "@hashintel/ds-components";
import type {
  FlowConnection,
  FlowEditor,
  StepPosition,
} from "@local/hash-isomorphic-utils/flows/flow-editor";
import type {
  Connection,
  EdgeChange,
  NodeChange,
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

const getNodeStepId = (node: FlowNode) =>
  node.type === "start" ? null : node.data.step.stepId;

type ContextTarget =
  | { kind: "step"; stepId: string }
  | { kind: "port"; stepId: string; side: "input" | "output" }
  | { kind: "connection"; connection: FlowConnection }
  | { kind: "start-line"; stepId: string }
  | { kind: "selection"; stepIds: string[] };

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
  const { fitView, getInternalNode, getZoom, screenToFlowPosition, setCenter } =
    useReactFlow<FlowNode, ConnectionEdgeType>();
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
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
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
        for (const step of editor.getState().flowDefinition.steps) {
          const position = positions.get(step.stepId);

          if (!step.position && position) {
            editor.moveStep(step.stepId, position);
          }
        }

        setForEachLayouts(layouts);
      })
      .catch(() => {
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

  useEffect(() => {
    if (!focusRequest) {
      return;
    }

    const node = getInternalNode(getStepNodeId(focusRequest.stepId));

    if (node) {
      const { x, y } = node.internals.positionAbsolute;

      void setCenter(
        x + (node.measured.width ?? stepCardSize.width) / 2,
        y + (node.measured.height ?? stepCardSize.height) / 2,
        { zoom: getZoom(), duration: 300 },
      );
    }
  }, [focusRequest, getInternalNode, getZoom, setCenter]);

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

  const selectedStepIdSet = new Set(selectedStepIds);
  const nodes = graph.nodes.map((node): FlowNode => {
    const stepId = getNodeStepId(node);

    return {
      ...node,
      position: dragPositions.get(node.id) ?? node.position,
      measured: measurements.get(node.id),
      selected: stepId !== null && selectedStepIdSet.has(stepId),
    } as FlowNode;
  });
  const edges = graph.edges.map((edge) => ({
    ...edge,
    selected: selectedEdgeIds.includes(edge.id),
  }));

  const topLevelStepIds = new Set(
    flowDefinition.steps.map(({ stepId }) => stepId),
  );
  /** `null` for Start and inner steps. */
  const getTopLevelStepId = (nodeId: string) => {
    const node = graph.nodes.find(({ id }) => id === nodeId);
    const stepId = node ? getNodeStepId(node) : null;

    return stepId !== null && topLevelStepIds.has(stepId) ? stepId : null;
  };

  const selectStep = (stepId: string) => {
    onSelectedStepIdsChange([stepId]);
    setSelectedEdgeIds([]);
  };

  const getTakenPlaces = () =>
    nodes
      .filter((node) => node.parentId === undefined)
      .map((node) => ({
        position: node.position,
        width: node.measured?.width ?? stepCardSize.width,
        height: node.measured?.height ?? stepCardSize.height,
      }));

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

  const canvasActions: CanvasActions = {
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
  };

  const openAddMenuAtContextPoint = (
    addStep: (actionDefinitionId: string, position: StepPosition) => void,
  ) => {
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

  const getContextMenuItems = (): MenuItem[] => {
    const disconnectAll = (
      stepIds: string[],
      { disabled = false } = {},
    ): MenuItem => ({
      id: "disconnect-all",
      text: "Disconnect all",
      icon: "close",
      disabled,
      onClick: () => {
        for (const stepId of stepIds) {
          editor.disconnectStep(stepId);
        }
      },
    });
    const insertStepHere = (
      addStep: (actionDefinitionId: string, position: StepPosition) => void,
    ): MenuItem => ({
      id: "insert-step",
      text: `Insert ${stepNoun.singular} here`,
      icon: "plus",
      onClick: () => openAddMenuAtContextPoint(addStep),
    });
    const removeConnections = (connections: FlowConnection[]) => {
      for (const connection of connections) {
        editor.removeConnection(connection);
      }
    };

    const getConnections = (stepId: string) => ({
      incoming: (
        flowDefinition.steps.find((step) => step.stepId === stepId)?.runAfter ??
        []
      ).map(({ stepId: from }) => ({ from, to: stepId })),
      outgoing: flowDefinition.steps
        .filter(({ runAfter }) =>
          runAfter?.some(({ stepId: from }) => from === stepId),
        )
        .map(({ stepId: to }) => ({ from: stepId, to })),
    });

    switch (contextTarget?.kind) {
      case "step": {
        const { incoming, outgoing } = getConnections(contextTarget.stepId);

        return [
          {
            id: "disconnect-previous",
            text: "Disconnect from previous",
            icon: "plug",
            disabled: incoming.length === 0,
            onClick: () => removeConnections(incoming),
          },
          disconnectAll([contextTarget.stepId], {
            disabled: incoming.length + outgoing.length === 0,
          }),
        ];
      }
      case "port": {
        const { incoming, outgoing } = getConnections(contextTarget.stepId);
        const atPort = contextTarget.side === "input" ? incoming : outgoing;

        return [
          {
            id: "disconnect",
            text: "Disconnect",
            icon: "plug",
            disabled: atPort.length === 0,
            onClick: () => removeConnections(atPort),
          },
          disconnectAll([contextTarget.stepId], {
            disabled: incoming.length + outgoing.length === 0,
          }),
        ];
      }
      case "connection": {
        const { connection } = contextTarget;

        return [
          {
            id: "disconnect",
            text: "Disconnect",
            icon: "plug",
            onClick: () => editor.removeConnection(connection),
          },
          insertStepHere((actionDefinitionId, position) =>
            selectStep(
              editor.addStep(actionDefinitionId, {
                into: connection,
                position,
              }),
            ),
          ),
        ];
      }
      case "start-line": {
        const { stepId: to } = contextTarget;

        /* A Start line isn't stored, so the new step just goes before its target. */
        return [
          insertStepHere((actionDefinitionId, position) => {
            const stepId = editor.addStep(actionDefinitionId, { position });

            editor.addConnection({ from: stepId, to });
            selectStep(stepId);
          }),
        ];
      }
      case "selection":
        return [disconnectAll(contextTarget.stepIds)];
      case undefined:
        /* Never shown, but an empty `items` makes `RightClickMenu` remount the canvas. */
        return [disconnectAll([])];
    }
  };

  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    const nextMeasurements = new Map(measurements);
    const nextDragPositions = new Map(dragPositions);
    const nextSelected = new Set(selectedStepIds);
    let selectionChanged = false;

    for (const change of changes) {
      if (change.type === "dimensions" && change.dimensions) {
        nextMeasurements.set(change.id, change.dimensions);
      } else if (
        change.type === "position" &&
        change.dragging &&
        change.position
      ) {
        nextDragPositions.set(change.id, change.position);
      } else if (change.type === "select") {
        const node = graph.nodes.find(({ id }) => id === change.id);
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

    setMeasurements(nextMeasurements);
    setDragPositions(nextDragPositions);

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

    setSelectedEdgeIds([...nextSelected]);
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
      !flowDefinition.steps
        .find(({ stepId }) => stepId === to)
        ?.runAfter?.some(({ stepId }) => stepId === from)
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
    const position = cardBeside(
      screenToFlowPosition({ x: point.clientX, y: point.clientY }),
      fromOutput ? "right" : "left",
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
    const removedStepIds = new Set(
      deletedNodes.flatMap((node) => {
        const stepId = getTopLevelStepId(node.id);

        return stepId === null ? [] : [stepId];
      }),
    );

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
    setSelectedEdgeIds([]);

    return Promise.resolve(false);
  };

  const organize = async () => {
    const { positions, forEachLayouts: layouts } = await layOutFlow(
      editor.getState().flowDefinition,
      collapsedStepIds,
    );

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

  return (
    <CanvasActionsContext value={canvasActions}>
      <Box ref={containerRef} sx={{ width: "100%", height: "100%" }}>
        <RightClickMenu items={getContextMenuItems()}>
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
            onNodeContextMenu={(event, node) => {
              const stepId = getTopLevelStepId(node.id);

              if (stepId === null) {
                refuseContextMenu(event);
                return;
              }

              rememberContextPoint(event);

              const handle =
                event.target instanceof Element
                  ? event.target.closest(".react-flow__handle")
                  : null;

              setContextTarget(
                handle
                  ? {
                      kind: "port",
                      stepId,
                      side: handle.classList.contains("source")
                        ? "output"
                        : "input",
                    }
                  : { kind: "step", stepId },
              );
            }}
            onEdgeContextMenu={(event, edge) => {
              if (edge.data?.kind === "connection") {
                setContextTarget({
                  kind: "connection",
                  connection: edge.data.connection,
                });
              } else if (edge.data?.kind === "start") {
                setContextTarget({
                  kind: "start-line",
                  stepId: edge.data.stepId,
                });
              } else {
                refuseContextMenu(event);
                return;
              }

              rememberContextPoint(event);
            }}
            onSelectionContextMenu={(event, selectedNodes) => {
              rememberContextPoint(event);
              setContextTarget({
                kind: "selection",
                stepIds: selectedNodes.flatMap((node) => {
                  const stepId = getTopLevelStepId(node.id);

                  return stepId === null ? [] : [stepId];
                }),
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
      </Box>
    </CanvasActionsContext>
  );
};

export const Canvas = (props: CanvasProps) => (
  <ReactFlowProvider>
    <FlowCanvas {...props} />
  </ReactFlowProvider>
);
