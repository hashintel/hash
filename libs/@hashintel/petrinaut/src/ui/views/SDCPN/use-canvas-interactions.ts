/**
 * What the user can do on the canvas, independent of how it is drawn.
 * Renderers turn their own hit testing and gestures into these calls, so every
 * renderer shares one set of selection, drag, connection and placement rules.
 */

import { use } from "react";

import {
  arcEndpointsEqual,
  DEFAULT_TRANSITION_KERNEL_CODE,
  generateDefaultLambdaCode,
  generatePetrinautId,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../react/hooks/use-petrinaut-mutations";
import { useReadOnlyFeedback } from "../../../react/hooks/use-read-only-feedback";
import { NotificationsContext } from "../../../react/notifications/context";
import { ActiveNetContext } from "../../../react/state/active-net-context";
import { CompositionContext } from "../../../react/state/composition-context";
import { EditorContext } from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { useInstantiableSubnets } from "../../../react/state/use-instantiable-subnets";
import { useIsReadOnly } from "../../../react/state/use-is-read-only";
import { UserSettingsContext } from "../../../react/state/user-settings-context";
import { snapPositionToGrid } from "../../lib/snap-position-to-grid";
import { linkEnd } from "./canvas-scene";
import { planFusion, planRewire, type RewirePlan } from "./fusion-links";

import type { DraggedNodeKind } from "../shared/canvas-node-drag";
import type {
  CanvasLinkEnd,
  CanvasLinkEndName,
  CanvasLinkEnds,
  CanvasNode,
  CanvasPoint,
  CanvasScene,
} from "./canvas-scene";
import type { FusionMember, SelectionMap } from "@hashintel/petrinaut-core";

/** A connection being drawn or just drawn, from its source to its target. */
export type CanvasConnection = CanvasLinkEnds;

/** A line on the canvas that is selected and hovered as one item: an arc, or a fusion through any of its links. */
export type CanvasLinkItem = { type: "arc" | "fusion"; id: string };

/** An end of a fusion link picked up and dropped somewhere else. */
export type CanvasLinkRewire = {
  /** The link, by its id in the scene. */
  linkId: string;
  end: CanvasLinkEndName;
  /** Where the end was dropped, `null` for the empty canvas. */
  onto: CanvasLinkEnd | null;
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
  hoverLink: (item: CanvasLinkItem) => void;
  clearHover: () => void;
  /** Arcs and fusions are selected only by a direct click, never by box selection. */
  selectLink: (item: CanvasLinkItem) => void;
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
  /** Whether dropping the end of a fusion link there would do anything. */
  canRewireLink: (rewire: CanvasLinkRewire) => boolean;
  /**
   * Moves a fusion from the member at the end of a link to the place or port
   * the end was dropped on. Dropped on the empty canvas, the member leaves
   * the fusion.
   */
  rewireLink: (rewire: CanvasLinkRewire) => void;
  /** A click on empty canvas: clears the selection or places a node, by mode. */
  clickPane: (scenePosition: CanvasPoint) => void;
  /** A node dragged in from the toolbar. */
  dropNode: (kind: DraggedNodeKind, scenePosition: CanvasPoint) => void;
  /** A component dragged in from the Components panel, named by its subnet. */
  dropComponent: (subnetId: string, scenePosition: CanvasPoint) => void;
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
  const { getItemType } = use(SDCPNContext);
  const { activeNet } = use(ActiveNetContext);
  const instantiable = useInstantiableSubnets();
  const { compositionOnly } = use(CompositionContext);
  const { addNotification } = use(NotificationsContext);
  const {
    addPlace,
    addTransition,
    addArc,
    addComponentInstance,
    addFusion,
    addFusionMember,
    removeFusionMember,
    replaceFusionMember,
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

  /** The fusion member an end of a line names, or `null` for a transition. */
  const memberOf = ({ nodeId, portId }: CanvasLinkEnd): FusionMember | null => {
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

  /**
   * What drawing a connection makes: an arc between a transition and a place
   * or port, a fusion of a port with a place or another port, or nothing.
   */
  const classify = (
    connection: CanvasConnection,
  ):
    | {
        kind: "arc";
        transitionId: string;
        arcDirection: "input" | "output";
        endpoint: FusionMember;
      }
    | { kind: "fusion"; first: FusionMember; second: FusionMember }
    | null => {
    const { sourceId, targetId } = connection;
    const first = memberOf(linkEnd(connection, "source"));
    const second = memberOf(linkEnd(connection, "target"));
    // An editor that only composes draws no arc: ports connect by fusion.
    if (!compositionOnly) {
      if (first && kindOf(targetId) === "transition") {
        return {
          kind: "arc",
          transitionId: targetId,
          arcDirection: "input",
          endpoint: first,
        };
      }
      if (second && kindOf(sourceId) === "transition") {
        return {
          kind: "arc",
          transitionId: sourceId,
          arcDirection: "output",
          endpoint: second,
        };
      }
    }
    return first &&
      second &&
      (first.kind === "componentPort" || second.kind === "componentPort") &&
      !arcEndpointsEqual(first, second)
      ? { kind: "fusion", first, second }
      : null;
  };

  const notifySecondAnchor = () =>
    addNotification({
      id: "fusion:second-anchor",
      message:
        "A fusion holds one place of this net. Fuse the port with that place instead.",
      tone: "neutral",
      durationMs: 4500,
    });

  const fuse = (first: FusionMember, second: FusionMember) => {
    const plan = planFusion(activeNet, first, second);
    if (plan.kind === "refused") {
      notifySecondAnchor();
      return;
    }
    const id = plan.kind === "join" ? plan.fusionId : generatePetrinautId();
    if (plan.kind === "join") {
      addFusionMember({ fusionId: id, member: plan.member });
    } else {
      addFusion({ id, members: plan.members });
    }
    selectItem({ type: "fusion", id });
  };

  const connect = (connection: CanvasConnection) => {
    const made = classify(connection);
    if (made?.kind === "arc") {
      const { transitionId, arcDirection, endpoint } = made;
      addArc({
        transitionId,
        arcDirection,
        ...(endpoint.kind === "place"
          ? { placeId: endpoint.placeId }
          : { endpoint }),
        weight: 1,
      });
    } else if (made?.kind === "fusion") {
      fuse(made.first, made.second);
    }
  };

  const planLinkRewire = ({
    linkId,
    end,
    onto,
  }: CanvasLinkRewire): RewirePlan => {
    const link = scene.fusions.find(({ id }) => id === linkId);
    const fusion = activeNet.fusions.find(({ id }) => id === link?.fusionId);
    const member = link && memberOf(linkEnd(link, end));
    const replacement = onto && memberOf(onto);
    return fusion && member && (onto === null || replacement)
      ? planRewire(activeNet, fusion, member, replacement)
      : { kind: "none" };
  };

  const rewireLink = (rewire: CanvasLinkRewire) => {
    const plan = planLinkRewire(rewire);
    if (plan.kind === "refused") {
      notifySecondAnchor();
    } else if (plan.kind === "detach") {
      removeFusionMember({ fusionId: plan.fusionId, member: plan.member });
    } else if (plan.kind === "replace") {
      const { fusionId, member, replacement } = plan;
      replaceFusionMember({ fusionId, member, replacement });
      selectItem({ type: "fusion", id: fusionId });
    }
  };

  const createNodeAt = (kind: DraggedNodeKind, rawPosition: CanvasPoint) => {
    if (readonly) {
      notifyReadOnly();
      return;
    }
    const id = generatePetrinautId();
    const itemNumber = scene.nodes.length + 1;
    const position = snap(rawPosition);

    if (kind === "place") {
      addPlace({
        id,
        name: `Place${itemNumber}`,
        colorId: null,
        dynamicsEnabled: false,
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
    selectItem({ type: kind, id });
    setEditionMode("cursor");
  };

  const createComponentInstanceAt = (
    subnetId: string,
    rawPosition: CanvasPoint,
  ) => {
    const subnet = instantiable.find(({ id }) => id === subnetId);
    const position = snap(rawPosition);
    const id = generatePetrinautId();

    addComponentInstance({
      id,
      name: subnet ? toInstanceName(subnet.name) : "Instance",
      subnetId,
      parameterValues: {},
      x: position.x,
      y: position.y,
    });
    selectItem({ type: "componentInstance", id });
    setEditionMode("cursor");
  };

  const clickPane = (scenePosition: CanvasPoint) => {
    if (editionMode === "cursor") {
      clearSelection();
    } else if (editionMode === "add-component") {
      if (componentSubnetId) {
        createComponentInstanceAt(componentSubnetId, scenePosition);
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
    const fusionIdByLinkId = new Map(
      scene.fusions.map((link) => [link.id, link.fusionId]),
    );
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
          // A change to a fusion's link is a change to the fusion.
          const id = fusionIdByLinkId.get(change.id) ?? change.id;
          if (change.selected && !base.has(id)) {
            const itemType = getItemType(id);
            if (itemType && itemType !== "arc" && itemType !== "fusion") {
              base.set(id, { type: itemType, id });
              changed = true;
            }
          } else if (!change.selected && base.has(id)) {
            base.delete(id);
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
    hoverLink: setHoveredItem,
    clearHover: clearHoveredItem,
    // Queued with the changes React Flow reports for the same click, so a
    // sibling link it deselects does not land after and undo the selection.
    selectLink: (item) =>
      setSelection(() => new Map([[item.id, item]]), { batch: "react-flow" }),
    applySelectionChanges,
    beginSelectionGesture,
    endSelectionGesture,
    clearSelection,
    moveNodes,
    dropNodes,
    isValidConnection: (connection) => classify(connection) !== null,
    connect,
    canRewireLink: (rewire) => planLinkRewire(rewire).kind !== "none",
    rewireLink,
    clickPane,
    dropNode: createNodeAt,
    dropComponent: createComponentInstanceAt,
  };
};
