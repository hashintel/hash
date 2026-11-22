/**
 * What the user can do on the canvas, independent of how it is drawn.
 * Renderers turn their own hit testing and gestures into these calls, so every
 * renderer shares one set of selection, drag, connection and placement rules.
 */

import { use } from "react";

import {
  arcEndpointsEqual,
  componentPortArcEndpoint,
  createArcEndpointReference,
  DEFAULT_TRANSITION_KERNEL_CODE,
  generateDefaultLambdaCode,
  generatePetrinautId,
  placeArcEndpoint,
  resolveComponent,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../react/hooks/use-petrinaut-mutations";
import { useReadOnlyFeedback } from "../../../react/hooks/use-read-only-feedback";
import { NotificationsContext } from "../../../react/notifications/context";
import { ActiveNetContext } from "../../../react/state/active-net-context";
import { CompositionContext } from "../../../react/state/composition-context";
import {
  useEditorActions,
  useEditorFields,
} from "../../../react/state/editor-context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { useComposesOnly } from "../../../react/state/use-composes-only";
import { useIsReadOnly } from "../../../react/state/use-is-read-only";
import { useUserSettings } from "../../../react/state/user-settings-context";
import { snapPositionToGrid } from "../../lib/snap-position-to-grid";
import { CanvasPointerContext } from "./canvas-pointer";
import { linkEnd } from "./canvas-scene";
import {
  fusionLinks,
  planFusion,
  planRewire,
  type RewirePlan,
} from "./fusion-links";
import { useStableActions } from "./use-stable-actions";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type { DraggedNodeKind } from "../shared/canvas-node-drag";
import type {
  CanvasLinkEnd,
  CanvasLinkEnds,
  CanvasNodeKind,
  CanvasPoint,
} from "./canvas-scene";
import type {
  ComponentReference,
  FusionMember,
  SelectionMap,
} from "@hashintel/petrinaut-core";

/** A connection being drawn or just drawn, from its source to its target. */
export type CanvasConnection = CanvasLinkEnds;

/** A line on the canvas that is selected and hovered as one item: an arc, or a fusion through any of its links. */
export type CanvasLinkItem = { type: "arc" | "fusion"; id: string };

/** An end of a fusion link picked up and dropped somewhere else. */
export type CanvasLinkRewire = {
  fusionId: string;
  /** The end picked up. */
  from: CanvasLinkEnd;
  /** Where the end was dropped, `null` for the empty canvas. */
  onto: CanvasLinkEnd | null;
};

export type CanvasNodeMove = { id: string; position: CanvasPoint };

/** A drag that ended; `position` is null when the renderer lost track of it. */
export type CanvasNodeDrop = { id: string; position: CanvasPoint | null };

export type CanvasSelectionChange = { id: string; selected: boolean };

/** What the pointer is doing as it comes onto an item. */
export type CanvasPointerPress = {
  /** A button is down, or the camera is moving by itself. */
  pressed: boolean;
  /** A connection is being drawn, or the end of a link moved. */
  connecting: boolean;
};

type CanvasPaneCursor = "copy" | "grab" | "default";

type CanvasModes = {
  readonly: boolean;
  /** Clicking the pane places a node or component instance. */
  isAddMode: boolean;
  /** Dragging the pane pans. */
  isPanMode: boolean;
  /** Dragging the pane draws a selection box. */
  isSelectMode: boolean;
  paneCursor: CanvasPaneCursor;
};

/**
 * What each gesture does. Every function keeps its identity for the life of
 * the canvas and reads the net and the editor's state when it is called, so
 * a renderer can hand them to memoized nodes and arcs.
 */
type CanvasActions = {
  /**
   * The pointer came onto a node, an arc or a fusion: a link of a fusion
   * hovers its fusion. With a button down the item waits for the release to
   * be hovered, so a canvas that pans under a pressed pointer lights up
   * nothing it carries past, and neither does a camera that moves by itself
   * under a pointer at rest. A connection being drawn is aimed at the item
   * it enters, which is hovered at once.
   */
  enter: (id: string, press: CanvasPointerPress) => void;
  /** Hovers an item whatever the buttons: a node is hovered from the start of its drag. */
  hover: (id: string) => void;
  /** The pointer left the item it was on. */
  clearHover: () => void;
  /**
   * The last button was released over the canvas, or the camera came to rest:
   * the item that waited for it is hovered.
   */
  releasePointer: () => void;
  /** Arcs and fusions are selected only by a direct click, never by box selection. */
  selectLink: (item: CanvasLinkItem) => void;
  /** Node selection changes from clicks and box selection. */
  applySelectionChanges: (changes: CanvasSelectionChange[]) => void;
  beginSelectionGesture: () => void;
  endSelectionGesture: () => void;
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
  /** A component dragged in from the Components panel. */
  dropComponent: (
    component: ComponentReference,
    scenePosition: CanvasPoint,
  ) => void;
};

export type CanvasInteractions = CanvasModes & CanvasActions;

/**
 * Converts a component's free-form display name to a valid PascalCase instance
 * name.
 * Splits on non-alphanumeric boundaries, capitalises each letter-starting word,
 * and appends a trailing numeric suffix if present.
 * "Hospital Ward" → "HospitalWard", "Component 1" → "Component1", "Coal Plant" → "CoalPlant"
 * Falls back to "Instance" when the result would not satisfy PascalCase.
 */
const toInstanceName = (componentName: string): string => {
  const words = componentName
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

type ConnectionOutcome =
  | {
      kind: "arc";
      transitionId: string;
      arcDirection: "input" | "output";
      endpoint: FusionMember;
    }
  | { kind: "fusion"; first: FusionMember; second: FusionMember };

const nodeKindsOf = (
  net: ActiveNetDefinition,
): ReadonlyMap<string, CanvasNodeKind> =>
  new Map<string, CanvasNodeKind>([
    ...net.places.map(({ id }) => [id, "place"] as const),
    ...net.transitions.map(({ id }) => [id, "transition"] as const),
    ...net.componentInstances.map(
      ({ id }) => [id, "componentInstance"] as const,
    ),
  ]);

export const useCanvasInteractions = (): CanvasInteractions => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { libraries } = use(CompositionContext);
  const composesOnly = useComposesOnly();
  const { activeNet } = use(ActiveNetContext);
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
  // By name: the canvas renders with this hook, and the editor context and
  // the settings change with each panel that opens.
  const { editionMode, componentToAdd, cursorMode } = useEditorFields(
    "editionMode",
    "componentToAdd",
    "cursorMode",
  );
  const {
    setEditionMode,
    beginSelectionGesture,
    endSelectionGesture,
    selectItem,
    setSelection,
    clearSelection,
  } = useEditorActions();
  const pointer = use(CanvasPointerContext);
  const snapToGrid = useUserSettings((settings) => settings.snapToGrid);
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

  const nodeKinds = nodeKindsOf(activeNet);

  /** The fusion member an end of a line names, or `null` for a transition. */
  const memberOf = ({ nodeId, portId }: CanvasLinkEnd): FusionMember | null => {
    const kind = nodeKinds.get(nodeId);
    if (kind === "place") {
      return placeArcEndpoint(nodeId);
    }
    if (kind === "componentInstance" && portId !== null) {
      return componentPortArcEndpoint({
        componentInstanceId: nodeId,
        portPlaceId: portId,
      });
    }
    return null;
  };

  /**
   * What drawing a connection makes: an arc between a transition and a place
   * or port, a fusion of a port with a place or another port, or nothing.
   */
  const classify = (connection: CanvasConnection): ConnectionOutcome | null => {
    const { sourceId, targetId } = connection;
    const first = memberOf(linkEnd(connection, "source"));
    const second = memberOf(linkEnd(connection, "target"));
    // An editor that only composes draws no arc: ports connect by fusion.
    if (!composesOnly) {
      if (first && nodeKinds.get(targetId) === "transition") {
        return {
          kind: "arc",
          transitionId: targetId,
          arcDirection: "input",
          endpoint: first,
        };
      }
      if (second && nodeKinds.get(sourceId) === "transition") {
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
    const fused =
      plan.kind === "join"
        ? addFusionMember({ fusionId: id, member: plan.member })
        : addFusion({ id, members: plan.members });
    if (fused) {
      selectItem({ type: "fusion", id });
    }
  };

  const connect = (connection: CanvasConnection) => {
    const made = classify(connection);
    if (made?.kind === "arc") {
      const { transitionId, arcDirection, endpoint } = made;
      addArc({
        transitionId,
        arcDirection,
        ...createArcEndpointReference(endpoint),
        weight: 1,
      });
    } else if (made?.kind === "fusion") {
      fuse(made.first, made.second);
    }
  };

  const planLinkRewire = ({
    fusionId,
    from,
    onto,
  }: CanvasLinkRewire): RewirePlan => {
    const fusion = activeNet.fusions.find(({ id }) => id === fusionId);
    const member = memberOf(from);
    if (!fusion || !member) {
      return { kind: "none" };
    }
    if (onto === null) {
      return planRewire(activeNet, fusion, member, null);
    }
    // A transition holds no place: there is nothing to move the fusion onto.
    const replacement = memberOf(onto);
    return replacement
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
      if (replaceFusionMember({ fusionId, member, replacement })) {
        selectItem({ type: "fusion", id: fusionId });
      }
    }
  };

  const createNodeAt = (kind: DraggedNodeKind, rawPosition: CanvasPoint) => {
    if (readonly) {
      notifyReadOnly();
      return;
    }
    const id = generatePetrinautId();
    const itemNumber = nodeKinds.size + 1;
    const position = snap(rawPosition);

    let added: boolean;
    if (kind === "place") {
      added = addPlace({
        id,
        name: `Place${itemNumber}`,
        colorId: null,
        dynamicsEnabled: false,
        x: position.x,
        y: position.y,
      });
    } else {
      added = addTransition({
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
    // A node that was refused is not there to select, and its tool stays up.
    if (added) {
      selectItem({ type: kind, id });
      setEditionMode("cursor");
    }
  };

  const createComponentInstanceAt = (
    reference: ComponentReference,
    rawPosition: CanvasPoint,
  ) => {
    const component = resolveComponent(
      petriNetDefinition,
      reference,
      libraries,
    );
    const position = snap(rawPosition);
    const id = generatePetrinautId();

    const added = addComponentInstance({
      id,
      name: component ? toInstanceName(component.name) : "Instance",
      component: reference,
      parameterValues: {},
      x: position.x,
      y: position.y,
    });
    if (added) {
      selectItem({ type: "componentInstance", id });
      setEditionMode("cursor");
    }
  };

  const clickPane = (scenePosition: CanvasPoint) => {
    if (editionMode === "cursor") {
      clearSelection();
    } else if (editionMode === "add-component") {
      if (componentToAdd) {
        createComponentInstanceAt(componentToAdd, scenePosition);
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
      activeNet.fusions.flatMap((fusion) =>
        fusionLinks(fusion).map((link) => [link.id, fusion.id] as const),
      ),
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
            const kind = nodeKinds.get(id);
            if (kind) {
              base.set(id, { type: kind, id });
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
    const preview = new Map(pointer.dragPreview.get());
    for (const { id, position } of moves) {
      preview.set(id, snap(position));
    }
    pointer.dragPreview.set(preview);
  };

  // Positions commit in one mutation and the previews clear in the same tick,
  // so a dropped node never shows its stale committed position in between.
  const dropNodes = (drops: CanvasNodeDrop[]) => {
    const commits = drops.flatMap(({ id, position }) => {
      const itemType = nodeKinds.get(id);
      return position && itemType
        ? [{ id, itemType, position: snap(position) }]
        : [];
    });

    const preview = pointer.dragPreview.get();
    if (drops.some(({ id }) => preview.has(id))) {
      const remaining = new Map(preview);
      for (const { id } of drops) {
        remaining.delete(id);
      }
      pointer.dragPreview.set(remaining);
    }

    if (commits.length > 0) {
      commitNodePositions({ commits });
    }
  };

  const actions = useStableActions<CanvasActions>({
    enter: (id, { pressed, connecting }) => {
      if (pressed && !connecting) {
        pointer.hoverOnReleaseId.set(id);
      } else {
        pointer.hoveredId.set(id);
        // What waited for a release is no longer under the pointer.
        pointer.hoverOnReleaseId.set(null);
      }
    },
    hover: (id) => pointer.hoveredId.set(id),
    clearHover: () => {
      pointer.hoveredId.set(null);
      pointer.hoverOnReleaseId.set(null);
    },
    releasePointer: () => {
      const entered = pointer.hoverOnReleaseId.get();
      if (entered !== null) {
        pointer.hoverOnReleaseId.set(null);
        pointer.hoveredId.set(entered);
      }
    },
    // Queued with the changes React Flow reports for the same click, so a
    // sibling link it deselects does not land after and undo the selection.
    selectLink: (item) =>
      setSelection(() => new Map([[item.id, item]]), { batch: "react-flow" }),
    applySelectionChanges,
    beginSelectionGesture,
    endSelectionGesture,
    moveNodes,
    dropNodes,
    isValidConnection: (connection) => classify(connection) !== null,
    connect,
    canRewireLink: (rewire) => planLinkRewire(rewire).kind !== "none",
    rewireLink,
    clickPane,
    dropNode: createNodeAt,
    dropComponent: createComponentInstanceAt,
  });

  return {
    readonly,
    isAddMode,
    isPanMode,
    isSelectMode,
    paneCursor: isAddMode ? "copy" : isPanMode ? "grab" : "default",
    ...actions,
  };
};
