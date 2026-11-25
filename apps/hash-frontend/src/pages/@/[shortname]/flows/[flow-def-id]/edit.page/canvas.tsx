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
  useStoreApi,
  ViewportPortal,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "@xyflow/react/dist/style.css";

import { RightClickMenu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { AddStepMenuAt } from "./canvas/add-step-menu";
import { addPickedStep, CanvasActionsContext } from "./canvas/canvas-actions";
import { CanvasToolbar } from "./canvas/canvas-toolbar";
import { ConnectionEdge } from "./canvas/connection-edge";
import { getContextMenuItems } from "./canvas/context-menu";
import {
  firstPlaceInBox,
  getFlowGraph,
  getStepNodeId,
  startNodeId,
} from "./canvas/flow-graph";
import {
  ForEachNode,
  StartNode,
  StepNode,
  TriggerNode,
} from "./canvas/flow-nodes";
import { getFreePosition, layOutFlow } from "./canvas/layout";
import {
  emptyForEachSize,
  forEachBoxPadding,
  getStepCardSize,
  stepCardSize,
  stepGap,
} from "./canvas/sizes";
import {
  getCenterToReveal,
  useSelectedStepInView,
  useStepFocus,
} from "./canvas/use-step-focus";
import { getScheduleSummary } from "./shared/flow-triggers";
import { useItemNames } from "./shared/item-name";
import { forEachAddId } from "./shared/step-display";
import { connectFromNewStep, getActionPaths } from "./shared/step-paths";

import type { CanvasActions } from "./canvas/canvas-actions";
import type { CanvasTool } from "./canvas/canvas-toolbar";
import type { AddStepAt, ContextTarget } from "./canvas/context-menu";
import type {
  ConnectionEdge as ConnectionEdgeType,
  FlowNode,
  ForEachLayout,
  TriggerCard,
} from "./canvas/flow-graph";
import type { FlowSchedules, TriggerKind } from "./shared/flow-triggers";
import type { FlowEditor } from "@local/hash-isomorphic-utils/flows/flow-editor";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";
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
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  Ref,
} from "react";

const nodeTypes = {
  trigger: TriggerNode,
  start: StartNode,
  step: StepNode,
  forEach: ForEachNode,
};

const edgeTypes = { connection: ConnectionEdge };

const canvas = css({ position: "relative", width: "full", height: "full" });
const ghostCard = css({
  position: "absolute",
  boxSizing: "border-box",
  borderWidth: "1px",
  borderStyle: "dashed",
  borderColor: "neutral.s70",
  borderRadius: "lg",
  bg: "neutral.s00",
  opacity: "[0.5]",
  pointerEvents: "none",
});

const getNodeStepId = (node: FlowNode) =>
  node.type === "trigger" || node.type === "start"
    ? null
    : node.data.step.stepId;

type AddMenuState = {
  /** Where the picked step will land, shown as a ghost card the menu opens beside. On the canvas, not in a box. */
  position: XYPosition;
  /** Whether the step will go inside a for-each step, where For each isn't offered. */
  insideForEach: boolean;
  /** Called with what was picked (see `addPickedStep`). */
  addStep: (addId: string) => void;
};

const addPoints = (first: XYPosition, second: XYPosition) => ({
  x: first.x + second.x,
  y: first.y + second.y,
});

/** Every step at any depth, by id, and the for-each step it's directly inside, if any. */
const indexSteps = (steps: StepDefinition<string>[]) => {
  const index = new Map<
    string,
    { step: StepDefinition<string>; parentStepId: string | null }
  >();
  const visit = (
    children: StepDefinition<string>[],
    parentStepId: string | null,
  ) => {
    for (const step of children) {
      index.set(step.stepId, { step, parentStepId });

      if (step.kind === "for-each") {
        visit(step.steps, step.stepId);
      }
    }
  };

  visit(steps, null);

  return index;
};

const refuseContextMenu = (event: ReactMouseEvent | MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

const cardBeside = (point: XYPosition, side: "left" | "right") => ({
  x: Math.round(side === "right" ? point.x : point.x - stepCardSize.width),
  y: Math.round(point.y - stepCardSize.height / 2),
});

export type CanvasHandle = {
  /** Adds what was picked (see `addPickedStep`) in the middle of the view, and selects it. */
  addStepInView: (addId: string) => void;
};

export type CanvasSelection = {
  stepIds: string[];
  start: boolean;
  trigger: TriggerKind | null;
};

type CanvasProps = {
  ref?: Ref<CanvasHandle>;
  editor: FlowEditor;
  selectedStepIds: string[];
  /** Whether the start step is selected, which opens its panel. */
  startSelected: boolean;
  selectedTrigger: TriggerKind | null;
  onSelectionChange: (selection: CanvasSelection) => void;
  /** A new object each time, so the same step can be focused twice. */
  focusRequest: { stepId: string } | null;
  collapsedStepIds: Set<string>;
  onToggleCollapsed: (stepId: string) => void;
  /** How much of the canvas's right edge a panel covers, in pixels. Steps are centred and fitted in the rest. */
  coveredRight: number;
  schedules: FlowSchedules;
};

const FlowCanvas = ({
  ref,
  editor,
  selectedStepIds,
  startSelected,
  selectedTrigger,
  onSelectionChange,
  focusRequest,
  collapsedStepIds,
  onToggleCollapsed,
  coveredRight,
  schedules,
}: CanvasProps) => {
  const { flowDefinition, problemsByStepId } = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
  );
  const {
    deleteElements,
    fitView,
    flowToScreenPosition,
    getInternalNode,
    getNodes,
    getViewport,
    screenToFlowPosition,
    setCenter,
  } = useReactFlow<FlowNode, ConnectionEdgeType>();
  const store = useStoreApi<FlowNode, ConnectionEdgeType>();
  const nodesInitialized = useNodesInitialized();
  const fitPadding = useMemo(
    () =>
      coveredRight > 0
        ? ({ x: "5%", y: "5%", right: `${coveredRight + 24}px` } as const)
        : undefined,
    [coveredRight],
  );

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
  /** Bumped by each add menu opened and each move by hand, so a menu waiting on its pan doesn't open after either. */
  const addMenuRequestRef = useRef(0);
  /** Where a step picked from the toolbar's add menu will land, while that menu is open. */
  const [toolbarAddPosition, setToolbarAddPosition] =
    useState<XYPosition | null>(null);

  useEffect(() => {
    let cancelled = false;

    layOutFlow(editor.getState().flowDefinition)
      .then(({ positions, forEachLayouts: layouts }) => {
        if (cancelled) {
          return;
        }

        /* On open, only steps with no saved position are placed: those inside a box where it lays them out. */
        const unplacedPositions = new Map<string, XYPosition>();

        for (const { step, parentStepId } of indexSteps(
          editor.getState().flowDefinition.steps,
        ).values()) {
          const position =
            parentStepId === null
              ? positions.get(step.stepId)
              : layouts.get(parentStepId)?.positions.get(step.stepId);

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
      void fitView({ maxZoom: 1, padding: fitPadding });
    }
  }, [nodesInitialized, fitView, fitPadding]);

  /* A step picked in the Steps tab replaces any selected connections. */
  const [lastFocusRequest, setLastFocusRequest] = useState(focusRequest);
  if (focusRequest !== lastFocusRequest) {
    setLastFocusRequest(focusRequest);
    setSelectedEdgeIds(new Set());
  }

  useStepFocus(focusRequest, coveredRight);

  useSelectedStepInView(selectedStepIds, coveredRight);

  const getItemName = useItemNames(flowDefinition);
  const triggers = useMemo(
    (): TriggerCard[] => [
      { kind: "manual", line: "On", on: true },
      {
        kind: "schedule",
        line: Array.isArray(schedules)
          ? getScheduleSummary(schedules)
          : schedules === "loading"
            ? "Loading…"
            : "Couldn't load",
        on: Array.isArray(schedules) && schedules.some(({ on }) => on),
      },
    ],
    [schedules],
  );
  const graph = useMemo(
    () =>
      forEachLayouts
        ? getFlowGraph({
            flowDefinition,
            problemsByStepId,
            forEachLayouts,
            collapsedStepIds,
            getItemName,
            triggers,
          })
        : { nodes: [], edges: [] },
    [
      flowDefinition,
      problemsByStepId,
      forEachLayouts,
      collapsedStepIds,
      getItemName,
      triggers,
    ],
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

      const selected =
        node.type === "trigger"
          ? node.data.kind === selectedTrigger
          : node.type === "start"
            ? startSelected
            : stepId !== null && selectedStepIdSet.has(stepId);

      return selected ? { ...node, selected: true } : node;
    });
  }, [measuredNodes, selectedStepIds, startSelected, selectedTrigger]);
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

  const steps = useMemo(
    () => indexSteps(flowDefinition.steps),
    [flowDefinition.steps],
  );
  /** `null` for Start and triggers. */
  const getStepIdOf = useCallback(
    (nodeId: string) => {
      const node = graphNodesById.get(nodeId);

      return node ? getNodeStepId(node) : null;
    },
    [graphNodesById],
  );
  const getStepIds = (stepNodes: FlowNode[]) =>
    stepNodes.flatMap((node) => {
      const stepId = getStepIdOf(node.id);

      return stepId === null ? [] : [stepId];
    });
  const getParentStepId = useCallback(
    (stepId: string | null) =>
      stepId === null ? null : (steps.get(stepId)?.parentStepId ?? null),
    [steps],
  );

  const selectStep = useCallback(
    (stepId: string) => {
      onSelectionChange({ stepIds: [stepId], start: false, trigger: null });
      setSelectedEdgeIds(new Set());
    },
    [onSelectionChange],
  );

  /** The places of the cards on the canvas, or inside the box of `parentStepId`, relative to it. */
  const getTakenPlaces = useCallback(
    (parentStepId: string | null = null) => {
      const parentNodeId =
        parentStepId === null ? undefined : getStepNodeId(parentStepId);

      return getNodes()
        .filter((node) => node.parentId === parentNodeId)
        .map((node) => ({
          position: node.position,
          width: node.measured?.width ?? stepCardSize.width,
          height: node.measured?.height ?? stepCardSize.height,
        }));
    },
    [getNodes],
  );

  /** Where the box of `parentStepId` is on the canvas, which places inside it are relative to. */
  const getBoxOrigin = useCallback(
    (parentStepId: string | null): XYPosition =>
      (parentStepId === null
        ? undefined
        : getInternalNode(getStepNodeId(parentStepId))?.internals
            .positionAbsolute) ?? { x: 0, y: 0 },
    [getInternalNode],
  );

  /** `position`, or below it if a new step's card would cover another card there. The ghost card is sized as a
   * step without paths, so a step with paths, or an empty box, is moved further down if it wouldn't fit. */
  const getNewStepPosition = useCallback(
    (addId: string, position: XYPosition, parentStepId: string | null = null) =>
      getFreePosition(
        position,
        addId === forEachAddId
          ? emptyForEachSize
          : getStepCardSize(getActionPaths(addId).length),
        getTakenPlaces(parentStepId),
      ),
    [getTakenPlaces],
  );

  /** Where a step added in the middle of the view lands. */
  const getPositionInView = () => {
    const bounds = containerRef.current?.getBoundingClientRect();

    if (!bounds) {
      return null;
    }

    const center = screenToFlowPosition({
      x: bounds.left + (bounds.width - coveredRight) / 2,
      y: bounds.top + bounds.height / 2,
    });

    return getFreePosition(
      {
        x: Math.round(center.x - stepCardSize.width / 2),
        y: Math.round(center.y - stepCardSize.height / 2),
      },
      stepCardSize,
      getTakenPlaces(),
    );
  };

  const addStepInView = (addId: string, position = getPositionInView()) => {
    if (position) {
      selectStep(
        addPickedStep(editor, addId, {
          position: getNewStepPosition(addId, position),
        }),
      );
    }
  };

  useImperativeHandle(ref, () => ({ addStepInView }));

  /** Opens the add menu beside its ghost card, first panning the card out from under a panel or the canvas's edge. */
  const openAddMenu = useCallback(
    (menu: AddMenuState) => {
      addMenuRequestRef.current += 1;
      const request = addMenuRequestRef.current;
      const viewport = getViewport();
      const { width, height } = store.getState();
      const center = getCenterToReveal(
        { ...menu.position, ...stepCardSize },
        viewport,
        { width, height },
        coveredRight,
      );

      if (!center) {
        setAddMenu(menu);
        return;
      }

      void setCenter(center.x, center.y, {
        zoom: viewport.zoom,
        duration: 300,
      }).then(() => {
        if (addMenuRequestRef.current === request) {
          setAddMenu(menu);
        }
      });
    },
    [getViewport, store, coveredRight, setCenter],
  );

  /* Kept the same while dragging, as every card and line reads it. */
  const canvasActions = useMemo<CanvasActions>(
    () => ({
      editing: {
        openAddMenuAfter: (stepId, outputName) => {
          const node = getInternalNode(
            stepId === null ? startNodeId : getStepNodeId(stepId),
          );

          if (!node) {
            return;
          }

          /* After a step inside a box, the new step goes beside it in the box. */
          const parentStepId = getParentStepId(stepId);
          const ghostPosition = getFreePosition(
            {
              x:
                node.position.x +
                (node.measured.width ?? stepCardSize.width) +
                stepGap,
              y: node.position.y,
            },
            stepCardSize,
            getTakenPlaces(parentStepId),
          );

          openAddMenu({
            position: addPoints(getBoxOrigin(parentStepId), ghostPosition),
            insideForEach: parentStepId !== null,
            addStep: (addId) => {
              const position = getNewStepPosition(
                addId,
                ghostPosition,
                parentStepId,
              );

              selectStep(
                addPickedStep(
                  editor,
                  addId,
                  stepId === null
                    ? { position }
                    : { after: stepId, outputName, position },
                ),
              );
            },
          });
        },
        openAddMenuInside: (forEachStepId) => {
          const ghostPosition = getFreePosition(
            firstPlaceInBox,
            stepCardSize,
            getTakenPlaces(forEachStepId),
          );

          openAddMenu({
            position: addPoints(getBoxOrigin(forEachStepId), ghostPosition),
            insideForEach: true,
            addStep: (addId) =>
              selectStep(
                addPickedStep(editor, addId, {
                  position: getNewStepPosition(
                    addId,
                    ghostPosition,
                    forEachStepId,
                  ),
                  inside: forEachStepId,
                }),
              ),
          });
        },
        removeConnection: editor.removeConnection,
      },
      toggleCollapsed: onToggleCollapsed,
    }),
    [
      editor,
      getBoxOrigin,
      getInternalNode,
      getNewStepPosition,
      getParentStepId,
      getTakenPlaces,
      openAddMenu,
      selectStep,
      onToggleCollapsed,
    ],
  );

  /** Where a card at `point` on screen goes in the box of `parentStepId`, or on the canvas. */
  const getPlaceAt = (
    point: XYPosition,
    side: "left" | "right",
    parentStepId: string | null,
  ) => {
    const origin = getBoxOrigin(parentStepId);
    const card = cardBeside(screenToFlowPosition(point), side);

    return getFreePosition(
      { x: card.x - origin.x, y: card.y - origin.y },
      stepCardSize,
      getTakenPlaces(parentStepId),
    );
  };

  const openAddMenuAtContextPoint = (
    addStep: AddStepAt,
    parentStepId: string | null,
  ) => {
    const position = getPlaceAt(contextPointRef.current, "right", parentStepId);

    openAddMenu({
      position: addPoints(getBoxOrigin(parentStepId), position),
      insideForEach: parentStepId !== null,
      addStep: (addId) =>
        addStep(addId, getNewStepPosition(addId, position, parentStepId)),
    });
  };

  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    const nextMeasurements = new Map(measurements);
    const nextDragPositions = new Map(dragPositions);
    const nextSelected = new Set(selectedStepIds);
    let nextStartSelected = startSelected;
    let nextTrigger = selectedTrigger;
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

        if (node?.type === "trigger") {
          selectionChanged = true;

          if (change.selected) {
            nextTrigger = node.data.kind;
          } else if (nextTrigger === node.data.kind) {
            nextTrigger = null;
          }
        } else if (change.id === startNodeId) {
          selectionChanged = true;
          nextStartSelected = change.selected;
        } else if (stepId !== null) {
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
      onSelectionChange({
        stepIds: [...nextSelected],
        start: nextStartSelected,
        trigger: nextTrigger,
      });
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
      const stepId = getStepIdOf(node.id);

      if (stepId !== null) {
        /* A card dragged out of its box's top or left goes back to its edge; the box grows to the right and down. */
        const inBox = node.parentId !== undefined;

        editor.moveStep(stepId, {
          x: Math.round(
            inBox
              ? Math.max(node.position.x, forEachBoxPadding.side)
              : node.position.x,
          ),
          y: Math.round(
            inBox
              ? Math.max(node.position.y, forEachBoxPadding.header)
              : node.position.y,
          ),
        });
      }
    }

    setDragPositions(new Map());
  };

  /**
   * A step can run after a step beside it, in its box or on the canvas, or inside a box after a step on the canvas
   * other than the box. Not twice after the same step.
   */
  const isValidConnection = ({
    source,
    target,
  }: Pick<Connection, "source" | "target">) => {
    const from = getStepIdOf(source);
    const to = getStepIdOf(target);

    if (from === null || to === null || from === to) {
      return false;
    }

    const fromParent = getParentStepId(from);
    const toParent = getParentStepId(to);

    return (
      (fromParent === toParent || (fromParent === null && from !== toParent)) &&
      !steps.get(to)?.step.runAfter?.some(({ stepId }) => stepId === from)
    );
  };

  const onConnectEnd: OnConnectEnd = (
    event,
    { isValid, toNode, fromNode, fromHandle },
  ) => {
    if (isValid || toNode || !fromNode || !fromHandle) {
      return;
    }

    const fromStepId = getStepIdOf(fromNode.id);

    if (fromNode.id !== startNodeId && fromStepId === null) {
      return;
    }

    const point = "changedTouches" in event ? event.changedTouches[0] : event;

    if (!point) {
      return;
    }

    /* From a step inside a box, the new step goes in the box too. */
    const parentStepId = getParentStepId(fromStepId);
    const fromOutput = fromHandle.type === "source";
    const ghostPosition = getPlaceAt(
      { x: point.clientX, y: point.clientY },
      fromOutput ? "right" : "left",
      parentStepId,
    );

    openAddMenu({
      position: addPoints(getBoxOrigin(parentStepId), ghostPosition),
      insideForEach: parentStepId !== null,
      addStep: (addId) => {
        const position = getNewStepPosition(addId, ghostPosition, parentStepId);

        if (fromStepId === null) {
          selectStep(addPickedStep(editor, addId, { position }));
        } else if (fromOutput) {
          selectStep(
            addPickedStep(editor, addId, {
              after: fromStepId,
              outputName: fromHandle.id ?? undefined,
              position,
            }),
          );
        } else {
          const stepId = addPickedStep(editor, addId, {
            position,
            ...(parentStepId !== null && { inside: parentStepId }),
          });

          connectFromNewStep(
            editor,
            { stepId, actionDefinitionId: addId },
            fromStepId,
          );
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
    /* With a box, React Flow deletes the steps inside it too, which removing the box removes. */
    const removedStepIds = new Set(getStepIds(deletedNodes));

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
      const parentStepId = getParentStepId(stepId);

      if (parentStepId === null || !removedStepIds.has(parentStepId)) {
        editor.removeStep(stepId);
      }
    }

    onSelectionChange({
      stepIds: selectedStepIds.filter((stepId) => !removedStepIds.has(stepId)),
      start: startSelected,
      trigger: selectedTrigger,
    });
    setSelectedEdgeIds(new Set());

    return Promise.resolve(false);
  };

  /*
   * React Flow's own delete key listens on the whole page, so a key pressed in the step panel or its menus would delete
   * the selection. Only keys pressed in the canvas delete, and not those from menus portalled out of it.
   */
  const onCanvasKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      (event.key !== "Backspace" && event.key !== "Delete") ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !(event.target instanceof Element) ||
      !event.currentTarget.contains(event.target) ||
      event.target.closest("input, textarea, select, [contenteditable]")
    ) {
      return;
    }

    void deleteElements({
      nodes: nodes.filter(({ selected }) => selected),
      edges: edges.filter(({ selected }) => selected),
    });
    store.setState({ nodesSelectionActive: false });
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

    for (const [stepId, position] of [
      ...positions,
      ...[...layouts.values()].flatMap((layout) => [...layout.positions]),
    ]) {
      editor.moveStep(stepId, position);
    }

    setForEachLayouts((current) => new Map([...(current ?? []), ...layouts]));
    requestAnimationFrame(() => {
      void fitView({ maxZoom: 1, duration: 300, padding: fitPadding });
    });
  };

  const rememberContextPoint = (event: ReactMouseEvent | MouseEvent) => {
    contextPointRef.current = { x: event.clientX, y: event.clientY };
  };

  /* Every card and line is given these, so they are kept the same while dragging. */
  const onNodeContextMenu = useCallback<NodeMouseHandler<FlowNode>>(
    (event, node) => {
      const stepId = getStepIdOf(node.id);

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
              outputName: handle.getAttribute("data-handleid") ?? undefined,
            }
          : { kind: "step", stepId },
      );
    },
    [getStepIdOf],
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

  const emptyFlow = flowDefinition.steps.length === 0;
  const ghostPosition = addMenu?.position ?? toolbarAddPosition;

  /** Where a card at `position` is on screen. */
  const getScreenRect = ({ x, y }: XYPosition) => {
    const topLeft = flowToScreenPosition({ x, y });
    const bottomRight = flowToScreenPosition({
      x: x + stepCardSize.width,
      y: y + stepCardSize.height,
    });

    return new DOMRect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y,
    );
  };

  return (
    <CanvasActionsContext value={canvasActions}>
      <div ref={containerRef} className={canvas}>
        <RightClickMenu
          items={getContextMenuItems({
            target: contextTarget,
            editor,
            steps,
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
            onConnect={({ source, sourceHandle, target }) => {
              const from = getStepIdOf(source);
              const to = getStepIdOf(target);

              if (from !== null && to !== null) {
                editor.addConnection({
                  from,
                  to,
                  outputName: sourceHandle ?? undefined,
                });
              }
            }}
            onConnectEnd={onConnectEnd}
            connectOnClick={false}
            connectionLineStyle={{ stroke: "var(--colors-blue-bd-strong)" }}
            onBeforeDelete={onBeforeDelete}
            deleteKeyCode={null}
            onKeyDown={onCanvasKeyDown}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            onSelectionContextMenu={(event, selectedNodes) => {
              rememberContextPoint(event);
              setContextTarget({
                kind: "selection",
                stepIds: getStepIds(selectedNodes),
              });
            }}
            onPaneContextMenu={refuseContextMenu}
            /* The menu wouldn't follow its ghost card, so panning or zooming by hand closes it. Moves made in code,
               such as panning the card into view, have no event. */
            onMoveStart={(event) => {
              if (event) {
                addMenuRequestRef.current += 1;
                setAddMenu(null);
              }
            }}
            panOnDrag={tool === "hand" ? true : [1]}
            selectionOnDrag={tool === "select"}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} />
            {ghostPosition && (
              <ViewportPortal>
                <div
                  className={ghostCard}
                  style={{
                    ...stepCardSize,
                    transform: `translate(${ghostPosition.x}px, ${ghostPosition.y}px)`,
                  }}
                />
              </ViewportPortal>
            )}
            <MiniMap
              position="top-right"
              pannable
              zoomable
              style={{ marginRight: coveredRight + 15 }}
            />
          </ReactFlow>
        </RightClickMenu>
        {/* Outside the right-click menu, whose Ark context would otherwise make
            the toolbar's menus its submenus: they open sideways and close as
            soon as the pointer leaves the trigger. */}
        <Panel position="bottom-center">
          <CanvasToolbar
            tool={tool}
            onToolChange={setTool}
            editing={{
              onAddStep: (addId) =>
                addStepInView(addId, toolbarAddPosition ?? undefined),
              onAddMenuOpen: (open) =>
                setToolbarAddPosition(open ? getPositionInView() : null),
              emptyFlow,
              onOrganize: () => {
                void organize();
              },
            }}
            fitPadding={fitPadding}
          />
        </Panel>
        {addMenu && (
          <AddStepMenuAt
            anchor={getScreenRect(addMenu.position)}
            emptyFlow={emptyFlow}
            insideForEach={addMenu.insideForEach}
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

export { RunCanvas } from "./canvas/run-canvas";
