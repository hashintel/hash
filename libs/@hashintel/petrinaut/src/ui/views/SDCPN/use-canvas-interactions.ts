/**
 * What the user can do on the canvas, independent of how it is drawn.
 * Renderers turn their own hit testing and gestures into these calls, so every
 * renderer shares one set of selection, drag, connection and placement rules.
 */

import { use } from "react";

import {
  DEFAULT_TRANSITION_KERNEL_CODE,
  findFusionWithMember,
  generateDefaultLambdaCode,
  generatePetrinautId,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../react/hooks/use-petrinaut-mutations";
import { useReadOnlyFeedback } from "../../../react/hooks/use-read-only-feedback";
import { ActiveNetContext } from "../../../react/state/active-net-context";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../react/state/use-is-read-only";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { snapPositionToGrid } from "../../lib/snap-position-to-grid";
import {
  type DraggedNodeKind,
  draggedComponentSubnetId,
} from "../shared/canvas-node-drag";

import type { CanvasNode, CanvasPoint, CanvasScene } from "./canvas-scene";
import type { FusionMember, SelectionMap } from "@hashintel/petrinaut-core";

export type CanvasConnection = {
  sourceId: string;
  targetId: string;
  /** The port place at either end when that end is a component instance. */
  sourcePortId: string | null;
  targetPortId: string | null;
};

export type CanvasNodeMove = { id: string; position: CanvasPoint };

/** A drag that ended; `position` is null when the renderer lost track of it. */
export type CanvasNodeDrop = { id: string; position: CanvasPoint | null };

export type CanvasSelectionChange = { id: string; selected: boolean };

export type CanvasPaneCursor = "copy" | "grab" | "default";

export type CanvasInteractions = {
  readonly: boolean;
  /** Clicking the pane places a node or component instance. */
  isAddMode: boolean;
  /** Dragging the pane pans. */
  isPanMode: boolean;
  /** Dragging the pane draws a selection box. */
  isSelectMode: boolean;
  paneCursor: CanvasPaneCursor;
  hoverNode: (node: Pick<CanvasNode, "id" | "kind">) => void;
  hoverArc: (id: string) => void;
  clearHover: () => void;
  /** Arcs are selected only by a direct click, never by box selection. */
  selectArc: (id: string) => void;
  /** A fusion is selected by clicking any of its links. */
  selectFusion: (fusionId: string) => void;
  hoverFusion: (fusionId: string) => void;
  /** Node selection changes from clicks and box selection. */
  applySelectionChanges: (changes: CanvasSelectionChange[]) => void;
  beginSelectionGesture: () => void;
  endSelectionGesture: () => void;
  clearSelection: () => void;
  /** Drag previews; positions snap when the grid is on. */
  moveNodes: (moves: CanvasNodeMove[]) => void;
  /** Drags that ended; commits the positions and clears the previews. */
  dropNodes: (drops: CanvasNodeDrop[]) => void;
  isValidConnection: (connection: CanvasConnection) => boolean;
  /**
   * Adds the arc for a valid connection and ignores an invalid one. A
   * connection between a place and an instance port, or two instance ports,
   * fuses them: into the fusion either already belongs to, else a new one.
   */
  connect: (connection: CanvasConnection) => void;
  /** A click on empty canvas: clears the selection or places a node, by mode. */
  clickPane: (scenePosition: CanvasPoint) => void;
  /** A node dragged in from the toolbar. */
  dropNode: (kind: DraggedNodeKind, scenePosition: CanvasPoint) => void;
};

/**
 * Converts a free-form subnet display name to a valid PascalCase instance name.
 * Splits on non-alphanumeric boundaries, capitalises each letter-starting word,
 * and appends a trailing numeric suffix if present.
 * "Hospital Ward" → "HospitalWard", "Subnet 1" → "Subnet1", "Coal Plant" → "CoalPlant"
 * Falls back to "Instance" when the result would not satisfy PascalCase.
 */
const toInstanceName = (subnetName: string): string => {
  const words = subnetName
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  const letterParts: string[] = [];
  let trailingNumber = "";

  for (const word of words) {
    if (/^\d+$/.test(word)) {
      trailingNumber = word;
    } else {
      const letters = word.replace(/[^a-zA-Z]/g, "");
      if (letters) {
        trailingNumber = "";
        letterParts.push(letters[0]!.toUpperCase() + letters.slice(1));
      }
    }
  }

  const result = letterParts.join("") + trailingNumber;
  return /^[A-Z][a-zA-Z]*\d*$/.test(result) ? result : "Instance";
};

const isCanvasItemType = (type: string) =>
  type === "place" ||
  type === "transition" ||
  type === "arc" ||
  type === "componentInstance" ||
  type === "fusion";

export const useCanvasInteractions = (
  scene: CanvasScene,
): CanvasInteractions => {
  const { petriNetDefinition, getItemType } = use(SDCPNContext);
  const { activeNet, activeSubnetId } = use(ActiveNetContext);
  const {
    addPlace,
    addTransition,
    addArc,
    addComponentInstance,
    addFusion,
    addFusionMember,
    commitNodePositions,
  } = usePetrinautMutations();
  const {
    editionMode,
    setEditionMode,
    componentSubnetId,
    cursorMode,
    beginSelectionGesture,
    endSelectionGesture,
    selectItem,
    setSelection,
    clearSelection,
    setHoveredItem,
    clearHoveredItem,
    updateDraggingStateByNodeId,
  } = use(EditorContext);
  const { snapToGrid } = use(UserSettingsContext);
  const readonly = useIsReadOnly();
  const notifyReadOnly = useReadOnlyFeedback();

  const isAddMode =
    editionMode === "add-place" ||
    editionMode === "add-transition" ||
    editionMode === "add-component";
  const isPanMode = editionMode === "cursor" && cursorMode === "pan";
  const isSelectMode = editionMode === "cursor" && cursorMode === "select";

  const snap = (position: CanvasPoint) =>
    snapToGrid ? snapPositionToGrid(position) : position;

  const kindOf = (id: string) =>
    scene.nodes.find((node) => node.id === id)?.kind;

  // The root net alone can be components-only; a subnet is where the
  // components themselves are drawn.
  const componentsOnly =
    activeSubnetId === null && petriNetDefinition.componentsOnly === true;

  /** The fusion member an end of a connection names, or `null` for a transition. */
  const memberOf = (
    nodeId: string,
    portId: string | null,
  ): FusionMember | null => {
    const kind = kindOf(nodeId);
    if (kind === "place") {
      return { kind: "place", placeId: nodeId };
    }
    if (kind === "componentInstance" && portId !== null) {
      return {
        kind: "componentPort",
        componentInstanceId: nodeId,
        portPlaceId: portId,
      };
    }
    return null;
  };

  const isFusionConnection = ({
    sourceId,
    targetId,
    sourcePortId,
    targetPortId,
  }: CanvasConnection): boolean => {
    const source = kindOf(sourceId);
    const target = kindOf(targetId);
    const touchesPort =
      (source === "componentInstance" && sourcePortId !== null) ||
      (target === "componentInstance" && targetPortId !== null);
    const placeOrPort = (kind: string | undefined, portId: string | null) =>
      kind === "place" || (kind === "componentInstance" && portId !== null);
    return (
      touchesPort &&
      placeOrPort(source, sourcePortId) &&
      placeOrPort(target, targetPortId) &&
      !(sourceId === targetId && sourcePortId === targetPortId)
    );
  };

  const isValidConnection = (connection: CanvasConnection): boolean => {
    const { sourceId, targetId, sourcePortId, targetPortId } = connection;
    const source = kindOf(sourceId);
    const target = kindOf(targetId);
    if (!source || !target) {
      return false;
    }
    if (source === "place" && target === "transition") {
      return true;
    }
    if (source === "transition" && target === "place") {
      return true;
    }
    if (source === "transition" && target === "componentInstance") {
      return targetPortId !== null;
    }
    if (source === "componentInstance" && target === "transition") {
      return sourcePortId !== null;
    }
    return isFusionConnection(connection);
  };

  const fuse = (first: FusionMember, second: FusionMember) => {
    const existing =
      findFusionWithMember(activeNet, first) ??
      findFusionWithMember(activeNet, second);
    if (existing) {
      // One of the two already belongs to a fusion: the other joins it, and
      // a fusion the other belonged to merges in.
      const member = findFusionWithMember(activeNet, first) ? second : first;
      addFusionMember({ fusionId: existing.id, member });
      selectItem({ type: "fusion", id: existing.id });
      return;
    }
    const id = generatePetrinautId();
    addFusion({ id, members: [first, second] });
    selectItem({ type: "fusion", id });
  };

  const connect = (connection: CanvasConnection) => {
    if (!isValidConnection(connection)) {
      return;
    }
    const { sourceId, targetId, sourcePortId, targetPortId } = connection;
    const source = kindOf(sourceId);
    const target = kindOf(targetId);

    if (source === "place" && target === "transition") {
      addArc({
        transitionId: targetId,
        arcDirection: "input",
        placeId: sourceId,
        weight: 1,
      });
    } else if (source === "transition" && target === "place") {
      addArc({
        transitionId: sourceId,
        arcDirection: "output",
        placeId: targetId,
        weight: 1,
      });
    } else if (
      source === "transition" &&
      target === "componentInstance" &&
      targetPortId
    ) {
      addArc({
        transitionId: sourceId,
        arcDirection: "output",
        endpoint: {
          kind: "componentPort",
          componentInstanceId: targetId,
          portPlaceId: targetPortId,
        },
        weight: 1,
      });
    } else if (
      source === "componentInstance" &&
      target === "transition" &&
      sourcePortId
    ) {
      addArc({
        transitionId: targetId,
        arcDirection: "input",
        endpoint: {
          kind: "componentPort",
          componentInstanceId: sourceId,
          portPlaceId: sourcePortId,
        },
        weight: 1,
      });
    } else {
      const first = memberOf(sourceId, sourcePortId);
      const second = memberOf(targetId, targetPortId);
      if (first && second) {
        fuse(first, second);
      }
    }
  };

  /**
   * Places an instance of `subnetId`, named after the subnet and numbered
   * past the instances of it the net already holds.
   */
  const createComponentInstanceAt = (
    rawPosition: CanvasPoint,
    subnetId: string,
  ) => {
    if (readonly) {
      notifyReadOnly();
      return;
    }
    const subnet = (petriNetDefinition.subnets ?? []).find(
      ({ id }) => id === subnetId,
    );
    const position = snap(rawPosition);
    const id = generatePetrinautId();
    const baseName = subnet ? toInstanceName(subnet.name) : "Instance";
    const taken = new Set(activeNet.componentInstances.map(({ name }) => name));
    let name = baseName;
    for (let suffix = 2; taken.has(name); suffix++) {
      name = `${baseName}${suffix}`;
    }

    addComponentInstance({
      id,
      name,
      subnetId,
      parameterValues: {},
      x: position.x,
      y: position.y,
    });
    selectItem({ type: "componentInstance", id });
    setEditionMode("cursor");
  };

  const createNodeAt = (kind: DraggedNodeKind, rawPosition: CanvasPoint) => {
    if (readonly) {
      notifyReadOnly();
      return;
    }
    const subnetId = draggedComponentSubnetId(kind);
    if (subnetId !== null) {
      createComponentInstanceAt(rawPosition, subnetId);
      return;
    }
    if (componentsOnly) {
      return;
    }
    const nodeKind = kind === "place" ? "place" : "transition";
    const id = generatePetrinautId();
    const itemNumber = scene.nodes.length + 1;
    const position = snap(rawPosition);

    if (nodeKind === "place") {
      addPlace({
        id,
        name: `Place${itemNumber}`,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: position.x,
        y: position.y,
      });
    } else {
      addTransition({
        id,
        name: `Transition${itemNumber}`,
        inputArcs: [],
        outputArcs: [],
        lambdaType: "predicate",
        lambdaCode: generateDefaultLambdaCode("predicate"),
        transitionKernelCode: DEFAULT_TRANSITION_KERNEL_CODE,
        x: position.x,
        y: position.y,
      });
    }
    selectItem({ type: nodeKind, id });
    setEditionMode("cursor");
  };

  const clickPane = (scenePosition: CanvasPoint) => {
    if (editionMode === "cursor") {
      clearSelection();
    } else if (editionMode === "add-component") {
      if (componentSubnetId) {
        createComponentInstanceAt(scenePosition, componentSubnetId);
      }
    } else if (editionMode === "add-place") {
      createNodeAt("place", scenePosition);
    } else {
      createNodeAt("transition", scenePosition);
    }
  };

  // A functional update, so that node and arc changes a renderer reports in
  // the same tick do not clobber each other through stale closures.
  const applySelectionChanges = (changes: CanvasSelectionChange[]) => {
    setSelection(
      (prevSelection) => {
        const hasNonCanvasItems = Array.from(prevSelection.values()).some(
          (item) => !isCanvasItemType(item.type),
        );
        const base: SelectionMap = new Map(
          hasNonCanvasItems ? [] : prevSelection,
        );
        let changed = hasNonCanvasItems && prevSelection.size > 0;

        for (const change of changes) {
          if (change.selected && !base.has(change.id)) {
            const itemType = getItemType(change.id);
            if (itemType && itemType !== "arc") {
              base.set(change.id, { type: itemType, id: change.id });
              changed = true;
            }
          } else if (!change.selected && base.has(change.id)) {
            base.delete(change.id);
            changed = true;
          }
        }

        return changed ? base : prevSelection;
      },
      { batch: "react-flow" },
    );
  };

  const moveNodes = (moves: CanvasNodeMove[]) => {
    updateDraggingStateByNodeId((existing) => {
      const next = { ...existing };
      for (const { id, position } of moves) {
        next[id] = { dragging: true, position: snap(position) };
      }
      return next;
    });
  };

  // Positions commit in one mutation and the previews clear in the same tick,
  // so a dropped node never shows its stale committed position in between.
  const dropNodes = (drops: CanvasNodeDrop[]) => {
    const commits = drops.flatMap(({ id, position }) => {
      const itemType = getItemType(id);
      if (
        !position ||
        (itemType !== "place" &&
          itemType !== "transition" &&
          itemType !== "componentInstance")
      ) {
        return [];
      }
      return [{ id, itemType, position: snap(position) }];
    });

    updateDraggingStateByNodeId((existing) => {
      // Unchanged state keeps its identity, so nothing re-renders.
      if (!drops.some(({ id }) => id in existing)) {
        return existing;
      }
      const droppedIds = new Set(drops.map(({ id }) => id));
      return Object.fromEntries(
        Object.entries(existing).filter(([id]) => !droppedIds.has(id)),
      );
    });

    if (commits.length > 0) {
      commitNodePositions({ commits });
    }
  };

  return {
    readonly,
    isAddMode,
    isPanMode,
    isSelectMode,
    paneCursor: isAddMode ? "copy" : isPanMode ? "grab" : "default",
    hoverNode: (node) => setHoveredItem({ type: node.kind, id: node.id }),
    hoverArc: (id) => setHoveredItem({ type: "arc", id }),
    clearHover: clearHoveredItem,
    selectArc: (id) => setSelection(new Map([[id, { type: "arc", id }]])),
    selectFusion: (id) => setSelection(new Map([[id, { type: "fusion", id }]])),
    hoverFusion: (id) => setHoveredItem({ type: "fusion", id }),
    applySelectionChanges,
    beginSelectionGesture,
    endSelectionGesture,
    clearSelection,
    moveNodes,
    dropNodes,
    isValidConnection,
    connect,
    clickPane,
    dropNode: createNodeAt,
  };
};
