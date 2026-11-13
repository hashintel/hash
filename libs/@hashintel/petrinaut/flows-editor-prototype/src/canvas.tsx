import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  MiniMap,
  type Connection,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Handle,
  type HandleProps,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
  useNodesInitialized,
  useReactFlow,
  useStoreApi,
} from "@xyflow/react";
import { Fragment, useEffect, useRef, useState } from "react";

import {
  Icon,
  type IconName,
  type ItemOrGroup,
  type MenuItem,
  RightClickMenu,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { getViewport, saveViewport } from "./app-store";
import { getCatalogEntry } from "./catalog";
import {
  START_ID,
  type DraftStep,
  type EditorDocument,
  findStep,
  flaggedOutputsOf,
  flattenSteps,
  removeStep,
  startSubtitle,
  stepTitle,
  updateStep,
} from "./document";
import { FLOW_OUTPUTS_ID, FlowOutputsCard } from "./flow-outputs";
import { useFlowOutputTake, useRunStars } from "./outputs";
import {
  type CanvasMenu,
  showDebug,
  showFull,
  useEditor,
} from "./editor-context";
import {
  ghostId,
  ghostKindOf,
  ghostKinds,
  ghostSummary,
  ghostTakeSummary,
  openTriggersPage,
  useFlowTriggers,
} from "./flow-triggers";
import { useRunView } from "./history-view";
import { useHighlightedSteps, withHighlight } from "./canvas-highlight";
import { ForEachBoxSwitch } from "./foreach-switch";
import { mockRuns, stepRunStatus } from "./mock-runs";
import { demoRun, nodePathsRun, nodePathsTake } from "./node-paths";
import { pathsTake } from "./paths-flags";
import { namedPorts } from "./switch-flags";
import { navigate, setQuery, useLocation } from "./router";
import {
  type BarMotion,
  barBreakdown,
  ensureBarKeyframes,
  glyphTooltip,
  reviewMotionOf,
  reviewOnceStyle,
  CardMark,
  RunBar,
  RunGlyph,
  TitleMark,
} from "./run-glyph";
import { flashLogRows } from "./run-log-panel";
import {
  barOf,
  type RunRecord,
  type StepRun,
  type StepState,
  runTriggerId,
  triggerLabel,
} from "./run-history";
import { plusGhostLook, plusOpenTake } from "./plus-open";
import { pickerTake } from "./step-picker";
import { describeSource } from "./shapes";
import {
  failedOutlineColor,
  glassColor,
  quietBarColor,
  strongBarColor,
  tileColor,
} from "./status-colors";
import {
  ghostLayout,
  triggerDistinctTake,
  triggerFiredTake,
  triggerNoneTake,
  useShowTriggers,
} from "./trigger-flags";
import { ToggleableTextInput } from "./ds-parts/toggleable-text-input";
import { Toast } from "./ds-parts/toast";

// The V7 card on ↳ Current: 200 wide, 12 px in, a 24 px tile and two lines (59 px with its border).
export const STEP_WIDTH = 200;
const STEP_HEIGHT = 59;
const PORT_ROW = 26;
const GROUP_HEADER = 48;
const GROUP_PADDING = 32;

/** A path pill (`?nodepaths=pills`) also carries its port and name. */
type StepData = { stepId: string; port?: string; label?: string };
type StepNode = Node<
  StepData,
  | "step"
  | "forEach"
  | "start"
  | "trigger"
  | "ghost"
  | "ghostTake"
  | "ghostSingle"
  | "ghostNote"
  | "flowOutputs"
  | "pathPill"
  | "plusGhost"
>;

/** `?paths=i2`: Ask a person's card also draws the Otherwise port its Paths section ends on. */
const otherwisePort = { outputName: "otherwise", label: "Default" };

const portRows = (step: DraftStep) => {
  if (step.kind !== "action") {
    return null;
  }
  const ports = getCatalogEntry(step.actionDefinitionId)?.ports ?? null;
  return ports && pathsTake === "i2" && step.actionDefinitionId !== "if"
    ? [...ports, otherwisePort]
    : ports && (step.pathNames !== undefined || step.noDefault === true)
      ? namedPorts(step, ports)
      : ports;
};

/** `?paths=attio`, `?nodepaths=rows|count`: a hollow ring for an open path, a filled dot for a connected one. */
const attioPorts =
  pathsTake === "attio" ||
  nodePathsTake === "rows" ||
  nodePathsTake === "count";

/** `?nodepaths=chips`: 18 px chips, 4 px apart, 6 px from the card's top and bottom. */
const PATH_CHIP = 18;
const PATH_CHIP_GAP = 4;
const chipsHeight = (count: number) =>
  Math.max(STEP_HEIGHT, count * (PATH_CHIP + PATH_CHIP_GAP) + 8);

const stepHeight = (step: DraftStep) => {
  const ports = portRows(step);
  if (!ports) {
    return STEP_HEIGHT;
  }
  switch (nodePathsTake) {
    case "wires":
    case "pills":
      return STEP_HEIGHT;
    case "chips":
      return chipsHeight(ports.length);
    case "count":
      return STEP_HEIGHT + PORT_ROW;
    default:
      return STEP_HEIGHT + ports.length * PORT_ROW;
  }
};

/** `?nodepaths=pills`: a path pill's node id, and where it sits from its step's top-left. */
const pillId = (stepId: string, port: string) => `pill:${stepId}:${port}`;
const PATH_PILL = 20;
const PATH_PILL_STEP = 26;
const pillPosition = (index: number, count: number) => ({
  x: STEP_WIDTH + 40,
  y:
    STEP_HEIGHT / 2 -
    PATH_PILL / 2 +
    (index - (count - 1) / 2) * PATH_PILL_STEP,
});

const groupSize = (document: EditorDocument, step: DraftStep) => {
  if (step.kind !== "for-each" || step.steps.length === 0) {
    return { width: 264, height: 168 };
  }
  let right = 0;
  let bottom = 0;
  for (const child of step.steps) {
    const position = document.positions[child.stepId] ?? { x: 0, y: 0 };
    const size =
      child.kind === "for-each"
        ? groupSize(document, child)
        : { width: STEP_WIDTH, height: stepHeight(child) };
    right = Math.max(right, position.x + size.width);
    bottom = Math.max(bottom, position.y + size.height);
  }
  return {
    width: Math.max(264, right + GROUP_PADDING + 8),
    height: Math.max(168, bottom + GROUP_PADDING + 4),
  };
};

/** J1.13: a folded For each is its header alone, 240 wide, a step card's height. */
const FOLDED_GROUP = { width: 240, height: 58 };

/** The gap kept around a step placed for the user, and how far down it moves to find room. */
const placeGap = 24;
const placeStep = 40;

/**
 * Where a step added after `stepId` goes: one column to its right (a card and the 96 px gap), level with it, moved down
 * until it overlaps no step, group or Start that shares its parent.
 */
export const freeSpotRightOf = (
  document: EditorDocument,
  stepId: string,
  collapsed: string[] = [],
): { x: number; y: number } => {
  const from = document.positions[stepId] ?? { x: 0, y: 0 };
  const parentId = findStep(document, stepId)?.parentId ?? null;
  const boxes = flattenSteps(document.steps)
    .filter((entry) => entry.parentId === parentId)
    .map(({ step }) => {
      const size =
        step.kind !== "for-each"
          ? { width: STEP_WIDTH, height: stepHeight(step) }
          : collapsed.includes(step.stepId)
            ? FOLDED_GROUP
            : groupSize(document, step);
      return {
        ...(document.positions[step.stepId] ?? { x: 0, y: 0 }),
        ...size,
      };
    });
  if (parentId === null && document.positions[START_ID]) {
    boxes.push({
      ...document.positions[START_ID],
      width: STEP_WIDTH,
      height: STEP_HEIGHT,
    });
  }
  const height = STEP_HEIGHT;
  const x = from.x + STEP_WIDTH + 96;
  const overlaps = (y: number) =>
    boxes.some(
      (box) =>
        x < box.x + box.width + placeGap &&
        x + STEP_WIDTH + placeGap > box.x &&
        y < box.y + box.height + placeGap &&
        y + height + placeGap > box.y,
    );
  let y = from.y;
  while (overlaps(y)) {
    y += placeStep;
  }
  return { x, y };
};

/** The ghost step drawn where a port's + will put the new step (`?plusopen=c`), and the new step's spot. */
export const PLUS_GHOST_ID = "plus-ghost";

/**
 * Where a step added from a port's + lands (`?plusopen=c`): one column right of the step (a For each's box is wider),
 * on the port's row (a later path, or the If's false port, one 120 px row down), then moved down until it overlaps no
 * step, group or Start that shares its parent. In the parent's coordinates, as `document.positions` are.
 */
export const plusLanding = (
  document: EditorDocument,
  after: { stepId: string; port: string },
  collapsed: string[] = [],
): { x: number; y: number } => {
  const from = document.positions[after.stepId] ?? { x: 0, y: 0 };
  const found = findStep(document, after.stepId);
  const parentId = found?.parentId ?? null;
  const sizeOf = (step: DraftStep) =>
    step.kind !== "for-each"
      ? { width: STEP_WIDTH, height: stepHeight(step) }
      : collapsed.includes(step.stepId)
        ? FOLDED_GROUP
        : groupSize(document, step);
  const boxes = flattenSteps(document.steps)
    .filter((entry) => entry.parentId === parentId)
    .map(({ step }) => ({
      ...(document.positions[step.stepId] ?? { x: 0, y: 0 }),
      ...sizeOf(step),
    }));
  if (parentId === null && document.positions[START_ID]) {
    boxes.push({
      ...document.positions[START_ID],
      width: STEP_WIDTH,
      height: STEP_HEIGHT,
    });
  }
  const ports = found ? portRows(found.step) : null;
  const pathIndex = Math.max(
    0,
    ports?.findIndex((port) => port.outputName === after.port) ?? 0,
  );
  const row = after.port === "false" ? Math.max(1, pathIndex) : pathIndex;
  const fromWidth = found ? sizeOf(found.step).width : STEP_WIDTH;
  const x = from.x + fromWidth + 96;
  const overlaps = (y: number) =>
    boxes.some(
      (box) =>
        x < box.x + box.width + placeGap &&
        x + STEP_WIDTH + placeGap > box.x &&
        y < box.y + box.height + placeGap &&
        y + STEP_HEIGHT + placeGap > box.y,
    );
  let y = from.y + row * 120;
  while (overlaps(y)) {
    y += placeStep;
  }
  return { x, y };
};

/** The document with a placeholder step at the + landing spot, so a For each it lands in grows around it. */
const withPlusGhost = (
  document: EditorDocument,
  after: { stepId: string; port: string },
  collapsed: string[],
): EditorDocument => {
  const parentId = findStep(document, after.stepId)?.parentId ?? null;
  const ghost: DraftStep = {
    kind: "action",
    stepId: PLUS_GHOST_ID,
    actionDefinitionId: PLUS_GHOST_ID,
    description: "",
    inputs: {},
  };
  const insert = (steps: DraftStep[]): DraftStep[] =>
    steps.map((step) =>
      step.kind !== "for-each"
        ? step
        : step.stepId === parentId
          ? { ...step, steps: [...step.steps, ghost] }
          : { ...step, steps: insert(step.steps) },
    );
  return {
    ...document,
    steps: parentId === null ? [...document.steps, ghost] : insert(document.steps),
    positions: {
      ...document.positions,
      [PLUS_GHOST_ID]: plusLanding(document, after, collapsed),
    },
  };
};


/** The steps inside folded For each boxes, which the canvas leaves out. */
const hiddenSteps = (document: EditorDocument, collapsed: string[]) => {
  const hidden = new Set<string>();
  const visit = (steps: DraftStep[], inside: boolean) => {
    for (const step of steps) {
      if (inside) {
        hidden.add(step.stepId);
      }
      if (step.kind === "for-each") {
        visit(step.steps, inside || collapsed.includes(step.stepId));
      }
    }
  };
  visit(document.steps, false);
  return hidden;
};

const toNodes = (
  document: EditorDocument,
  selectedId: string | null,
  collapsed: string[] = [],
  selectedIds: string[] = [],
) => {
  const isSelected = (id: string) =>
    selectedId === id || selectedIds.includes(id);
  const nodes: StepNode[] = [
    {
      id: START_ID,
      type: "start",
      position: document.positions[START_ID] ?? { x: 360, y: 220 },
      data: { stepId: START_ID },
      selected: isSelected(START_ID),
      // Start holds the flow's inputs, so it stays.
      deletable: false,
    },
  ];
  const visit = (steps: DraftStep[], parentId?: string) => {
    for (const step of steps) {
      const folded =
        step.kind === "for-each" && collapsed.includes(step.stepId);
      const size =
        step.kind !== "for-each"
          ? undefined
          : folded
            ? FOLDED_GROUP
            : groupSize(document, step);
      nodes.push({
        id: step.stepId,
        type: step.kind === "for-each" ? "forEach" : "step",
        position: document.positions[step.stepId] ?? { x: 0, y: 0 },
        data: { stepId: step.stepId },
        selected: isSelected(step.stepId),
        ...(parentId ? { parentId, extent: "parent" as const } : {}),
        ...(size ? { style: { width: size.width, height: size.height } } : {}),
      });
      if (step.kind === "for-each" && !folded) {
        visit(step.steps, step.stepId);
      }
      const ports = nodePathsTake === "pills" ? portRows(step) : null;
      ports?.forEach((port, index) => {
        nodes.push({
          id: pillId(step.stepId, port.outputName),
          type: "pathPill",
          parentId: step.stepId,
          position: pillPosition(index, ports.length),
          data: {
            stepId: step.stepId,
            port: port.outputName,
            label: port.label,
          },
          draggable: false,
          selectable: false,
          deletable: false,
        });
      });
    }
  };
  visit(document.steps);
  return nodes;
};

const wireStyle = { stroke: "rgba(0, 0, 0, 0.2)", strokeWidth: 1.5 };

/** `?nodepaths=…&run`: the run's wires in the DS success tone; the rest faint and dashed. */
const ranWireStyle = { stroke: "var(--colors-green-s70)", strokeWidth: 1.5 };
const untakenWireStyle = {
  stroke: "rgba(0, 0, 0, 0.14)",
  strokeWidth: 1.5,
  strokeDasharray: "4 3",
};

const toEdges = (
  document: EditorDocument,
  collapsed: string[] = [],
): Edge[] => {
  const hidden = hiddenSteps(document, collapsed);
  const run = nodePathsRun ? demoRun(document) : null;
  const runStyle = (ran: boolean) => (ran ? ranWireStyle : untakenWireStyle);
  const portsOf = (stepId: string) => {
    const step = findStep(document, stepId)?.step;
    return step ? portRows(step) : null;
  };
  const wires: Edge[] = document.wires
    .filter((wire) => !hidden.has(wire.source) && !hidden.has(wire.target))
    .map((wire) => {
      const port = portsOf(wire.source)?.find(
        (candidate) => candidate.outputName === wire.sourcePort,
      );
      const fromPill = nodePathsTake === "pills" && port;
      return {
        id: wire.id,
        source: fromPill ? pillId(wire.source, wire.sourcePort) : wire.source,
        sourceHandle: wire.sourcePort,
        target: wire.target,
        targetHandle: "in",
        type: "flow",
        // `?nodepaths=wires`: the wire carries its path's name.
        ...(nodePathsTake === "wires" && port
          ? {
              data: {
                label: port.label,
                faint: run ? !run.ranWires.has(wire.id) : false,
              },
            }
          : {}),
        style: run ? runStyle(run.ranWires.has(wire.id)) : wireStyle,
      };
    });
  if (nodePathsTake !== "pills") {
    return wires;
  }
  // `?nodepaths=pills`: a short wire from the card to each of its pills.
  const pills: Edge[] = flattenSteps(document.steps).flatMap(({ step }) => {
    if (hidden.has(step.stepId)) {
      return [];
    }
    return (portRows(step) ?? []).map((port) => ({
      id: `${pillId(step.stepId, port.outputName)}:in`,
      source: step.stepId,
      sourceHandle: "paths",
      target: pillId(step.stepId, port.outputName),
      targetHandle: "in",
      selectable: false,
      focusable: false,
      style: run
        ? runStyle(
            run.ran.has(step.stepId) &&
              run.takenPort(step.stepId) === port.outputName,
          )
        : wireStyle,
    }));
  });
  return [...wires, ...pills];
};

/**
 * A step selected in a run is shown by fading everything else (Spotlight; inbox run-selected-state, 12 Nov), as its
 * coloured bar leaves no edge for a selection border. `?runselect=border` keeps the selected card's dark border.
 */
const runSpotlight =
  new URLSearchParams(globalThis.location.search).get("runselect") !== "border";

const cardStyle = cva({
  base: {
    position: "relative",
    width: "[200px]",
    backgroundColor: "neutral.bgSolid.min",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
    borderRadius: "lg",
    transition: "[border-color 0.15s ease, box-shadow 0.3s ease]",
    "&:hover [data-port-add]": { opacity: "[1]" },
    // `?nodepaths=…&run`: a step the run did not reach, faint; a path it did not take, fainter than the one it took.
    "&[data-run-faint]": { opacity: "[0.45]" },
    "& [data-path-taken]": { color: "neutral.fg.body" },
    "& [data-path-untaken]": { opacity: "[0.55]" },
    // Read-only in a run: nothing to add from a port.
    "&[data-read-only] [data-port-add]": { display: "none" },
    // A reference to this step is hovered in the panel: the soft ring a new step glows with, and the +, as on hover.
    "&[data-source-hover]": {
      boxShadow: "[0 0 0 3px var(--flows-sel-halo)]",
    },
    // A step just added for the user (Look up in the graph) glows for a moment.
    "&[data-flash]": {
      borderColor: "[var(--flows-sel-border)]",
      boxShadow: "[0 0 0 4px var(--flows-sel-halo)]",
    },
  },
  variants: {
    selected: {
      true: {
        // 1.5 px blue, drawn inside so the card keeps its size.
        borderColor: "[var(--flows-sel-border)]",
        boxShadow: "[inset 0 0 0 0.5px var(--flows-sel-border)]",
        "& [data-port-add]": { opacity: "[1]" },
      },
    },
  },
});

const neutralTile = {
  backgroundColor: "neutral.bgSolid.surface",
  color: "neutral.fg.muted",
} as const;

const cardTileStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: "[24px]",
    height: "[24px]",
    borderRadius: "sm",
    "&[class] svg": {
      width: "[14px]",
      height: "[14px]",
      "--icon-size": "14px",
    },
  },
  // Icons are neutral, on an almost invisible tile (Aakarsh, 4 Nov: "too heavy"); `tone` stays for when the
  // Flows palette is picked.
  variants: {
    tone: {
      green: neutralTile,
      orange: neutralTile,
      blue: neutralTile,
      neutral: neutralTile,
    },
  },
});

/** The V7 card's tile: a 14 px icon on a 24 px tile with a pale wash of the step's colour. */
const CardTile = ({
  icon,
  tone,
  ghost = false,
}: {
  icon: IconName;
  tone: "green" | "orange" | "neutral" | "blue";
  ghost?: boolean;
}) => (
  <span className={cardTileStyle({ tone })} style={tileColor(icon, ghost)}>
    <Icon name={icon} size="sm" />
  </span>
);

// The tile sits centred on the title and description block (Aakarsh, 4 Nov).
/** B2: the run's featured-output star, top right of the card, 12 px, filled, muted (the Steps list's faint star). */
const runStarStyle = css({
  position: "absolute",
  top: "[10px]",
  right: "[10px]",
  display: "inline-flex",
  color: "neutral.fg.muted",
  pointerEvents: "none",
  "& svg": { width: "[12px]", height: "[12px]", fill: "[currentColor]" },
});

const cardHeadStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  padding: "3",
  // Take 2's corner glyph keeps the title clear of it.
  ":has(> [data-corner-glyph]) > &": { paddingRight: "[28px]" },
});

// Two classes outrank React Flow's own handle style.
const handleStyle = css({
  "&.react-flow__handle": {
    width: "[7px]",
    height: "[7px]",
    minWidth: "[7px]",
    minHeight: "[7px]",
    backgroundColor: "neutral.bgSolid.min",
    borderWidth: "thin",
    borderColor: "neutral.bd.strong",
  },
  // `?paths=attio`, `?nodepaths=`: a connected path's port is a filled dot; an open one stays a hollow ring.
  "&.react-flow__handle[data-connected]": {
    backgroundColor: "neutral.fg.subtle",
    borderColor: "neutral.fg.subtle",
  },
  // `&run`: the path the run took, in the DS success tone; the others faint.
  "&.react-flow__handle[data-taken]": {
    backgroundColor: "[var(--colors-green-s70)]",
    borderColor: "[var(--colors-green-s70)]",
  },
  "&.react-flow__handle[data-untaken]": { opacity: "[0.5]" },
  // J1.21: the port whose menu is open shows the selection colour.
  "&.react-flow__handle[data-highlight]": {
    backgroundColor: "[var(--flows-sel-border)]",
    borderColor: "[var(--flows-sel-border)]",
  },
});

/** A port: right-click opens Disconnect / Disconnect all for it (J1.21). */
const PortHandle = ({
  stepId,
  ...props
}: HandleProps & {
  stepId: string;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) => {
  const { ui, setUi } = useEditor();
  const runView = useRunView();
  const port = props.id ?? (props.type === "source" ? "next" : "in");
  const menu = ui.canvasMenu;
  const highlighted =
    menu?.kind === "port" && menu.stepId === stepId && menu.port === port;
  return (
    <Handle
      {...props}
      data-highlight={highlighted || undefined}
      onContextMenu={(event) => {
        if (runView) {
          event.stopPropagation();
          return;
        }
        setUi((current) => ({
          ...current,
          picker: null,
          canvasMenu: {
            kind: "port",
            stepId,
            port,
            side: props.type,
            point: { x: event.clientX, y: event.clientY },
          },
        }));
      }}
    />
  );
};

const portAddStyle = css({
  position: "absolute",
  // Centred on the 7 px port it belongs to (J0.5, J2.4: the + replaces the port dot on hover).
  left: "[50%]",
  top: "[50%]",
  width: "[22px]",
  height: "[22px]",
  borderRadius: "full",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle.hover",
  color: "neutral.fg.muted",
  cursor: "pointer",
  opacity: "[0]",
  transition: "[opacity 0.15s ease]",
  transform: "[translate(-50%, -50%)]",
  zIndex: "[2]",
  _hover: {
    borderColor: "[var(--flows-sel-border)]",
    color: "neutral.fg.heading",
  },
  _focusVisible: {
    opacity: "[1]",
    outline: "[2px solid var(--flows-sel-border)]",
  },
  // `?plusopen=`: the + its picker is open from stays, in the figma-ds pressed fill.
  "&[data-plus-open], &[data-plus-open]:hover": {
    opacity: "[1]",
    backgroundColor: "neutral.bg.subtle.active",
    borderColor: "neutral.bd.subtle.hover",
    color: "neutral.fg.heading",
  },
});

/** E3: the + on a port, which opens the picker and wires the new step to this port. */
const PortAdd = ({ stepId, port }: { stepId: string; port: string }) => {
  const { document, ui, setUi } = useEditor();
  // A run is read-only: no + on its ports.
  if (useRunView() || nodePathsRun) {
    return null;
  }
  const dangling = !document.wires.some(
    (wire) => wire.source === stepId && wire.sourcePort === port,
  );
  return (
    <button
      type="button"
      aria-label="Add a step after this one"
      className={portAddStyle}
      style={ui.showPortAddOn === stepId ? { opacity: 1 } : undefined}
      data-port-add={`${stepId}:${port}`}
      data-dangling={dangling || undefined}
      data-plus-open={
        (plusOpenTake &&
          ui.picker?.anchor === "port" &&
          ui.picker.after?.stepId === stepId &&
          ui.picker.after.port === port) ||
        undefined
      }
      onClick={(event) => {
        event.stopPropagation();
        setUi((current) => ({
          ...current,
          picker: { after: { stepId, port }, anchor: "port" },
        }));
      }}
    >
      <Icon name="plus" size="xxs" />
    </button>
  );
};

const errorDotStyle = css({
  position: "absolute",
  top: "[-4px]",
  right: "[-4px]",
  width: "[10px]",
  height: "[10px]",
  borderRadius: "full",
  backgroundColor: "[var(--flows-failed-mark)]",
  borderWidth: "[2px]",
  borderStyle: "solid",
  borderColor: "neutral.bgSolid.min",
});

/** A run opened from History in the top bar: a green dot on each step it got through, red on the one it failed at. */
const runDotStyle = css({
  position: "absolute",
  top: "[-4px]",
  right: "[-4px]",
  width: "[8px]",
  height: "[8px]",
  borderRadius: "full",
  "&[data-status=done]": { backgroundColor: "[var(--flows-done-mark)]" },
  "&[data-status=failed]": { backgroundColor: "[var(--flows-failed-mark)]" },
});

const RunDot = ({ stepId }: { stepId: string }) => {
  const { document, ui } = useEditor();
  const run = ui.viewRunId
    ? mockRuns(document).find((candidate) => candidate.id === ui.viewRunId)
    : undefined;
  const status = run ? stepRunStatus(document, run, stepId) : null;
  return status ? (
    <span
      className={runDotStyle}
      data-status={status}
      aria-label={status === "done" ? "Ran" : "Failed here"}
    />
  ) : null;
};

/**
 * How a run-view card shows its status, as four takes for Aakarsh to compare (4 Nov: the faint bar was "a bit too
 * hard to read, especially since we aren't doing icons of status on the node itself"). Read from ?nodestatus= only,
 * never remembered; take 1 is the default.
 * 1. The 2 px bar two steps above the palette's own bar for every state (today: about s80; O2 and O4: s70).
 * 2. Run marks B: a 12 px F3 glyph at the top right of a step that runs once; the s80 bar on a step that repeats.
 * 3. Colour only where attention is needed: a 3 px bar for failed, running and needs review; done stays faint.
 * 4. Attio: a small pill above the card for every state but done, and a faint red outline round a step card with
 *    failures.
 * `4bar`: take 4's pills over take 1's bar on every card, flat (?nodeglow=bar motion unless the URL asks for
 *    bar-review), with no red outline.
 */
type NodeStatusTake = 1 | 2 | 3 | 4 | "4bar";

const nodeStatusTake: NodeStatusTake = (() => {
  const value = new URLSearchParams(globalThis.location.search).get(
    "nodestatus",
  );
  if (value === "4bar") {
    return value;
  }
  const take = Number(value);
  return take === 2 || take === 3 || take === 4 ? take : 1;
})();

/**
 * Soft glow on run-view cards, as four takes (4 Nov: "a soft diffuse glow ... maybe a glassy version, a reflective
 * version, because yeah, the solid bar ... doesn't look good"). Read from ?nodeglow= only; with none, cards stay flat.
 * Research and which take draws on which reference: ops/projects/flows-editor/references/node-glow-1104/README.md.
 * 1. Fuser's running halo, toned down: a soft blurred shadow under the card in its state's colour; done barely.
 * 2. Glass (Fuser's hero nodes and `.inset-shadow`): a faint top-to-bottom shade, a 1 px inner light edge and a tiny
 *    neutral drop shadow; the state stays in the bar.
 * 3. A reflective bar: each segment fades up from the edge and casts a faint reflection of itself up the card.
 * 4. A halo on the card's edge (Fuser's selected ring): the border tinted by the state, with a 3 px wash outside.
 *
 * Round 2, subtler than take 1 (4 Nov: "some of these might be too overkill for our app ... more subtle this time").
 * Done and not-reached cards draw nothing in all four; only failed, running and needs review do.
 * 5. Faint glow: take 1 at about half the strength and a third of the spread.
 * 6. Inner hairline: a 1 px state-tinted line just inside the border; nothing outside the card.
 * 7. Edge tint: a soft tint rising a few px from the bottom edge, as if the bar lit the card's foot.
 * 8. Running and needs review only: take 5's glow with a 1 px ring, breathing slowly (4 s); still under reduced
 *    motion. Failed stays bar-only.
 */
type NodeGlowTake = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Bar only (Alex), decided provisionally 5 Nov (Aakarsh; Alex: "our design language is very flat with almost no
 * shadows, so I would avoid glows… go for crisper lines instead"): the default. A flat 2 px bar with no glow or words;
 * a light band shimmers along a running segment every 2 s; needs review and failed stay still.
 * ?nodeglow=pulse brings back the running fade it replaced; ?nodeglow=bar the darker sweep; ?nodeglow=bar-review that
 * sweep plus a needs-review shift light to dark and back over 4 s.
 */
const barMotion: BarMotion = (() => {
  const value = new URLSearchParams(globalThis.location.search).get("nodeglow");
  if (value === "bar" || value === "bar-review" || value === "pulse") {
    return value;
  }
  return nodeStatusTake === "4bar" ? "bar" : "shimmer";
})();

/**
 * Needs review's motion over every take (?reviewmotion=off|once|loop, URL only): off by default, loop under
 * ?nodeglow=bar-review. `once` pulses the card's words in take 4 and 4bar, the bar segment in the others.
 */
const reviewMotion = reviewMotionOf(
  barMotion === "bar-review" ? "loop" : "off",
);

const nodeGlowTake: NodeGlowTake = (() => {
  const take = Number(
    new URLSearchParams(globalThis.location.search).get("nodeglow"),
  );
  return Number.isInteger(take) && take >= 1 && take <= 8
    ? (take as NodeGlowTake)
    : 0;
})();

type GlowTone = "done" | "failed" | "running" | "review";

const glowToneOf = (mark: StepRun): GlowTone | null => {
  switch (mark.state) {
    case "failed":
      return "failed";
    case "doneWithFailures":
      return (mark.progress?.failed ?? 0) > 0 ? "failed" : "done";
    case "running":
      return "running";
    case "needsReview":
      return "review";
    case "done":
      return "done";
    default:
      return null;
  }
};

/** `color` at `percent` opacity. */
const tint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

const glowShadow = (take: NodeGlowTake, tone: GlowTone | null) => {
  const color = tone ? strongBarColor[tone] : undefined;
  const done = tone === "done";
  switch (take) {
    case 1:
      if (!color) {
        return undefined;
      }
      return done
        ? `0 8px 20px -12px ${tint(color, 35)}`
        : `0 10px 28px -10px ${tint(color, 55)}, 0 2px 8px -3px ${tint(color, 28)}`;
    case 2:
      return [
        `inset 0 1px 0 0 ${glassColor.highlight}`,
        `inset 0 0 0 1px ${tint(glassColor.highlight, 70)}`,
        `0 1px 2px 0 ${glassColor.shade}`,
        `0 6px 16px -10px ${glassColor.drop}`,
      ].join(", ");
    case 4:
      if (!color) {
        return undefined;
      }
      return done
        ? `inset 0 0 0 1px ${tint(color, 18)}`
        : `inset 0 0 0 1px ${tint(color, 55)}, 0 0 0 3px ${tint(color, 12)}`;
    case 5:
      return color && !done ? `0 3px 10px -4px ${tint(color, 30)}` : undefined;
    case 6:
      return color && !done ? `inset 0 0 0 1px ${tint(color, 28)}` : undefined;
    case 7:
      return color && !done
        ? `inset 0 -10px 12px -10px ${tint(color, 22)}`
        : undefined;
    case 8:
      return color && (tone === "running" || tone === "review")
        ? `0 0 0 1px ${tint(color, 20)}, 0 3px 12px -4px ${tint(color, 35)}`
        : undefined;
    default:
      return undefined;
  }
};

const glowLayerStyle = css({
  position: "absolute",
  borderRadius: "[inherit]",
  pointerEvents: "none",
});

/** Take 8's slow breath; none under reduced motion. */
const breatheStyle = css({
  animation: "pulse",
  animationDuration: "[4s]",
  animationIterationCount: "infinite",
  "@media (prefers-reduced-motion: reduce)": { animation: "none" },
});

/** The ?nodeglow= layer over a run card: its shadows, and the glassy take's shade. */
const RunGlow = ({ mark, radius }: { mark: StepRun; radius: "lg" | "xl" }) => {
  if (nodeGlowTake === 0 || nodeGlowTake === 3) {
    return null;
  }
  const boxShadow = glowShadow(nodeGlowTake, glowToneOf(mark));
  if (!boxShadow) {
    return null;
  }
  const glass = nodeGlowTake === 2;
  return (
    <span
      aria-hidden
      data-run-glow={nodeGlowTake}
      className={
        nodeGlowTake === 8 ? cx(glowLayerStyle, breatheStyle) : glowLayerStyle
      }
      style={
        nodeGlowTake === 4
          ? // Over the card's 1 px border, so the tint recolours the border itself.
            { inset: -1, boxShadow }
          : {
              inset: 0,
              borderRadius: `calc(var(--radii-${radius}) - 1px)`,
              boxShadow,
              // The For each box keeps its own fill; only cards take the shade.
              background:
                glass && radius === "lg"
                  ? `linear-gradient(to bottom, transparent 35%, ${glassColor.shade} 100%)`
                  : undefined,
            }
      }
    />
  );
};

const attentionStates = new Set(["failed", "running", "review"]);

const cornerGlyphStyle = css({
  position: "absolute",
  display: "flex",
  pointerEvents: "none",
});

const statusPillStyle = css({
  position: "absolute",
  right: "[0]",
  bottom: "[calc(100% + 6px)]",
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  height: "[20px]",
  paddingX: "[6px]",
  borderRadius: "full",
  textStyle: "xs",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  pointerEvents: "none",
});

const pillLabel: Partial<Record<StepState, string>> = {
  failed: "Failed",
  running: "Running",
  needsReview: "Needs review",
  doneWithFailures: "Some failed",
};

const pillTone: Partial<Record<StepState, string>> = {
  failed: "failed",
  running: "running",
  needsReview: "needsReview",
  doneWithFailures: "failed",
};

/** A card's run mark, in the take ?nodestatus= picks. `group` is the For each box, whose header is 48 px. */
const RunMark = ({ mark, group }: { mark?: StepRun; group?: boolean }) => {
  const segments = barOf(mark);
  if (!mark || !segments) {
    return null;
  }
  const radius = group ? "xl" : "lg";
  const finish = nodeGlowTake === 3 ? "reflect" : "solid";
  return (
    <>
      <RunGlow mark={mark} radius={radius} />
      <RunMarkTake
        mark={mark}
        segments={segments}
        group={group}
        radius={radius}
        finish={finish}
      />
    </>
  );
};

const RunMarkTake = ({
  mark,
  segments,
  group,
  radius,
  finish,
}: {
  mark: StepRun;
  segments: NonNullable<ReturnType<typeof barOf>>;
  group?: boolean;
  radius: "lg" | "xl";
  finish: "solid" | "reflect";
}) => {
  // A step repeats when it runs per item: its bar is split by item.
  const repeats = Boolean(mark.bar && mark.bar.length > 0);
  // Hovering the bar gives the full breakdown: a step that ran once says its state and detail ("Done", "Failed ·
  // Timed out after 48 h"), one that ran per item counts each state ("18 done · 1 failed · 1 running").
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const breakdown =
    total > 1
      ? barBreakdown(segments)
      : glyphTooltip(mark.state, mark.progress);
  if (nodeStatusTake === 2) {
    return repeats ? (
      <RunBar
        segments={segments}
        colors={strongBarColor}
        radius={radius}
        finish={finish}
        motion={barMotion}
        reviewMotion={reviewMotion}
        breakdown={breakdown}
      />
    ) : (
      <span
        data-corner-glyph
        className={cornerGlyphStyle}
        style={group ? { top: 18, right: 12 } : { top: 10, right: 10 }}
      >
        <RunGlyph state={mark.state} progress={mark.progress} />
      </span>
    );
  }
  if (nodeStatusTake === 3) {
    const loud = segments.some((segment) => attentionStates.has(segment.state));
    // Not reached draws no track: only what ran shows.
    const shown = segments.filter((segment) => segment.state !== "rest");
    return shown.length > 0 ? (
      <RunBar
        segments={shown}
        colors={quietBarColor}
        height={loud ? 3 : 2}
        radius={radius}
        finish={finish}
        motion={barMotion}
        reviewMotion={reviewMotion}
        breakdown={breakdown}
      />
    ) : null;
  }
  if (nodeStatusTake === 4 || nodeStatusTake === "4bar") {
    const flat = nodeStatusTake === "4bar";
    // The words carry the once pulse here, so the bar under them stays still.
    const wordsReviewMotion = reviewMotion === "once" ? "off" : reviewMotion;
    const pulseWords = reviewMotion === "once" && mark.state === "needsReview";
    if (pulseWords) {
      ensureBarKeyframes();
    }
    const label =
      mark.state === "doneWithFailures" && mark.progress
        ? `${mark.progress.failed} failed`
        : pillLabel[mark.state];
    const tone = pillTone[mark.state];
    return (
      <>
        {label && tone ? (
          <span
            key={mark.state}
            data-status-pill={mark.state}
            className={
              pulseWords
                ? cx(statusPillStyle, reviewOnceStyle)
                : statusPillStyle
            }
            style={{
              backgroundColor: `var(--flows-${tone}-badgeBg)`,
              color: `var(--flows-${tone}-badgeFg)`,
            }}
          >
            <RunGlyph state={mark.state} progress={mark.progress} />
            {label}
          </span>
        ) : null}
        {/* A step card that failed, or whose items partly failed; the For each box keeps its own border. */}
        {!flat &&
        !group &&
        (mark.state === "failed" ||
          (mark.state === "doneWithFailures" &&
            (mark.progress?.failed ?? 0) > 0)) ? (
          <span
            aria-hidden
            data-failed-outline
            className={css({
              position: "absolute",
              inset: "[-1px]",
              borderRadius: "[inherit]",
              borderWidth: "thin",
              borderStyle: "solid",
              pointerEvents: "none",
            })}
            style={{ borderColor: failedOutlineColor }}
          />
        ) : null}
        {/* Only a step that repeats keeps a bar, its items in the faint colours; 4bar keeps take 1's bar on every card. */}
        {flat ? (
          <RunBar
            segments={segments}
            colors={strongBarColor}
            radius={radius}
            finish={finish}
            motion={barMotion}
            reviewMotion={wordsReviewMotion}
            breakdown={breakdown}
          />
        ) : repeats ? (
          <RunBar
            segments={segments}
            radius={radius}
            finish={finish}
            motion={barMotion}
            reviewMotion={wordsReviewMotion}
            breakdown={breakdown}
          />
        ) : null}
      </>
    );
  }
  return (
    <>
      <CardMark state={mark.state} progress={mark.progress} group={group} />
      <RunBar
        segments={segments}
        colors={strongBarColor}
        radius={radius}
        finish={finish}
        motion={barMotion}
        reviewMotion={reviewMotion}
        breakdown={breakdown}
      />
    </>
  );
};

const ProblemDot = ({ stepId }: { stepId: string }) => {
  const { validation } = useEditor();
  const problems = [
    ...(validation.byStep.get(stepId) ?? []).filter(
      (diagnostic) => diagnostic.severity === "error",
    ),
    ...(validation.incomplete.has(stepId)
      ? [{ message: "Choose the list to go through and what to collect" }]
      : []),
  ];
  if (!showDebug || problems.length === 0) {
    return null;
  }
  return (
    <Tooltip content={problems.map((problem) => problem.message).join(" · ")}>
      <span
        className={errorDotStyle}
        aria-label={`${problems.length} problems`}
      />
    </Tooltip>
  );
};

const flatFind = (document: EditorDocument, stepId: string) => {
  const visit = (steps: DraftStep[]): DraftStep | undefined => {
    for (const step of steps) {
      if (step.stepId === stepId) {
        return step;
      }
      if (step.kind === "for-each") {
        const found = visit(step.steps);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  };
  return visit(document.steps);
};

const oneLineStyle = cva({
  base: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  variants: {
    tone: {
      // Node title = body, description = muted (DS roles); tight leading keeps the card at the V7 height.
      title: {
        textStyle: "sm",
        lineHeight: "tight",
        fontWeight: "medium",
        color: "neutral.fg.body",
      },
      body: { textStyle: "xs", lineHeight: "tight", color: "neutral.fg.muted" },
      muted: {
        textStyle: "xs",
        lineHeight: "tight",
        color: "neutral.fg.subtle",
      },
    },
  },
});

/** Two fixed lines, so every card has one height: the type, then the description or a muted prompt for one. */
/** A run, or a past version open from the version menu (V6), is read-only. */
const useReadOnlyCanvas = () => {
  const runView = useRunView();
  const viewingVersion = useLocation().query.has("version");
  return Boolean(runView) || viewingVersion;
};

const CardText = ({
  title,
  description,
  onDescription,
  label = "Step description",
  titleEnd,
}: {
  title: string;
  /** ?cardmark=p4: the run state's glyph after the title. */
  titleEnd?: React.ReactNode;
  description?: string;
  /** Renames the description in place on the card (Attio's pattern); none in a run or a past version. */
  onDescription?: (value: string) => void;
  /** The rename field's name for assistive tech. */
  label?: string;
}) => (
  <span
    className={css({
      display: "flex",
      flexDirection: "column",
      gap: "0",
      minWidth: "[0]",
      flex: "1",
    })}
  >
    {titleEnd ? (
      <span style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
        <CardTitle title={title} />
        {titleEnd}
      </span>
    ) : (
      <CardTitle title={title} />
    )}
    {onDescription ? (
      <ToggleableTextInput
        compact
        value={description ?? ""}
        placeholder="Add a description…"
        label={label}
        onSave={onDescription}
      />
    ) : (
      <span className={oneLineStyle({ tone: description ? "body" : "muted" })}>
        {description ?? "Add a description…"}
      </span>
    )}
  </span>
);

const CardTitle = ({ title }: { title: string }) => (
  <span
    className={oneLineStyle({ tone: "title" })}
    // The full title on hover only when it is cut off.
    onMouseEnter={(event) => {
      const element = event.currentTarget;
      element.title = element.scrollWidth > element.clientWidth ? title : "";
    }}
  >
    {title}
  </span>
);

/** A step just added from a picker fades and grows in, over the canvas's 200 ms pan (Attio's fit-to-view, 4 Nov). */
const useEnterAnimation = (id: string) => {
  const { ui } = useEditor();
  const ref = useRef<HTMLDivElement>(null);
  const entering = ui.enterId === id;
  useEffect(() => {
    if (entering) {
      ref.current?.animate(
        [
          { opacity: 0, transform: "scale(0.96)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }
  }, [entering]);
  return ref;
};

/** A path port's state: open or connected (`?paths=attio`, `?nodepaths=`), and taken or not in the demo run. */
const pathPortState = (
  document: EditorDocument,
  run: ReturnType<typeof demoRun> | null,
  stepId: string,
  port: string,
) => {
  const state: Record<string, true> = {};
  if (attioPorts || nodePathsTake) {
    const connected = document.wires.some(
      (wire) => wire.source === stepId && wire.sourcePort === port,
    );
    if (connected) {
      state["data-connected"] = true;
    }
  }
  if (run?.ran.has(stepId)) {
    state[run.takenPort(stepId) === port ? "data-taken" : "data-untaken"] =
      true;
  }
  return state;
};

const pathFootStyle = css({
  position: "relative",
  height: "[26px]",
  display: "flex",
  alignItems: "center",
  paddingX: "3",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
  textStyle: "xs",
  color: "neutral.fg.subtle",
});

/** `?nodepaths=wires`: an open path's name beside its hollow port, where its wire would start. */
const openPathLabelStyle = css({
  position: "absolute",
  left: "[calc(100% + 10px)]",
  transform: "[translateY(-50%)]",
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
  pointerEvents: "none",
});

const pathChipsStyle = css({
  position: "absolute",
  top: "[0]",
  bottom: "[0]",
  left: "[calc(100% - 8px)]",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "flex-start",
  gap: "[4px]",
});

/** `?nodepaths=chips`: a path on the card's edge; dashed while it leads nowhere. */
const pathChipStyle = css({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  height: "[18px]",
  paddingLeft: "1.5",
  paddingRight: "[10px]",
  borderWidth: "thin",
  borderStyle: "dashed",
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "full",
  backgroundColor: "neutral.bgSolid.min",
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
  "&[data-connected]": {
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
  },
});

/**
 * A branching card's paths under `?nodepaths=` (`node-paths.ts`). `rows` and an open `count` card draw the rows the
 * card has today, with hollow and filled ports; this draws the other takes.
 */
const NodePaths = ({
  stepId,
  ports,
}: {
  stepId: string;
  ports: { outputName: string; label: string }[];
}) => {
  const { document } = useEditor();
  const run = nodePathsRun ? demoRun(document) : null;
  const state = (port: string) => pathPortState(document, run, stepId, port);
  const connected = (port: string) =>
    document.wires.some(
      (wire) => wire.source === stepId && wire.sourcePort === port,
    );
  const runText = (port: string) =>
    run?.ran.has(stepId)
      ? run.takenPort(stepId) === port
        ? { "data-path-taken": true }
        : { "data-path-untaken": true }
      : {};

  if (nodePathsTake === "rows") {
    return (
      <div
        className={css({
          borderTopWidth: "thin",
          borderTopStyle: "solid",
          borderTopColor: "neutral.bd.subtle",
        })}
      >
        {ports.map((port) => (
          <div
            key={port.outputName}
            className={css({
              position: "relative",
              height: "[26px]",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              paddingRight: "3",
              textStyle: "xs",
              color: "neutral.fg.subtle",
            })}
            {...runText(port.outputName)}
          >
            {port.label}
            <PortHandle
              stepId={stepId}
              id={port.outputName}
              type="source"
              position={Position.Right}
              className={handleStyle}
              style={{ top: PORT_ROW / 2 }}
              {...state(port.outputName)}
            >
              <PortAdd stepId={stepId} port={port.outputName} />
            </PortHandle>
          </div>
        ))}
      </div>
    );
  }

  if (nodePathsTake === "count") {
    const taken = run?.ran.has(stepId)
      ? ports.find((port) => port.outputName === run.takenPort(stepId))
      : undefined;
    const open = ports.filter((port) => !connected(port.outputName)).length;
    return (
      <div className={pathFootStyle}>
        {taken ? (
          <span data-path-taken>Took {taken.label}</span>
        ) : (
          <span>
            {ports.length} paths
            {open > 0 ? ` · ${open} open` : ""}
          </span>
        )}
        {/* Every path leaves one port while the card is closed. */}
        {ports.map((port) => (
          <PortHandle
            key={port.outputName}
            stepId={stepId}
            id={port.outputName}
            type="source"
            position={Position.Right}
            className={handleStyle}
            style={{ top: PORT_ROW / 2 }}
            {...state(port.outputName)}
          />
        ))}
      </div>
    );
  }

  if (nodePathsTake === "chips") {
    return (
      <div className={pathChipsStyle}>
        {ports.map((port) => (
          <span
            key={port.outputName}
            className={pathChipStyle}
            data-connected={connected(port.outputName) || undefined}
            {...runText(port.outputName)}
          >
            {port.label}
            <PortHandle
              stepId={stepId}
              id={port.outputName}
              type="source"
              position={Position.Right}
              className={handleStyle}
              style={{ top: "50%" }}
              {...state(port.outputName)}
            >
              <PortAdd stepId={stepId} port={port.outputName} />
            </PortHandle>
          </span>
        ))}
      </div>
    );
  }

  if (nodePathsTake === "pills") {
    return (
      <PortHandle
        stepId={stepId}
        id="paths"
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{ top: STEP_HEIGHT / 2 }}
        isConnectable={false}
        data-connected
      />
    );
  }

  // `wires`: the ports spread down the card's right edge, at most 14 px apart.
  const spacing =
    ports.length > 1
      ? Math.min(14, (STEP_HEIGHT - 16) / (ports.length - 1))
      : 0;
  const topOf = (index: number) =>
    STEP_HEIGHT / 2 + (index - (ports.length - 1) / 2) * spacing;
  return (
    <>
      {ports.map((port, index) => (
        <Fragment key={port.outputName}>
          <PortHandle
            stepId={stepId}
            id={port.outputName}
            type="source"
            position={Position.Right}
            className={handleStyle}
            style={{ top: topOf(index) }}
            {...state(port.outputName)}
          >
            <PortAdd stepId={stepId} port={port.outputName} />
          </PortHandle>
          {connected(port.outputName) ? null : (
            <span
              className={openPathLabelStyle}
              style={{ top: topOf(index) }}
              {...runText(port.outputName)}
            >
              {port.label}
            </span>
          )}
        </Fragment>
      ))}
    </>
  );
};

/** `?nodepaths=pills`: a path as a small node after its card; its wire leaves the pill. Moves with the card. */
const pathPillStyle = css({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  height: "[20px]",
  paddingX: "2",
  borderWidth: "thin",
  borderStyle: "dashed",
  borderColor: "neutral.bd.subtle.hover",
  borderRadius: "full",
  backgroundColor: "neutral.bgSolid.min",
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
  "&[data-connected]": {
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
  },
  "&:hover [data-port-add]": { opacity: "[1]" },
  "&[data-path-taken]": { color: "neutral.fg.body" },
  "&[data-path-untaken], &[data-run-faint]": { opacity: "[0.55]" },
});

const PathPillNodeView = ({ data }: NodeProps<StepNode>) => {
  const { document } = useEditor();
  const run = nodePathsRun ? demoRun(document) : null;
  const port = data.port ?? "next";
  const connected = document.wires.some(
    (wire) => wire.source === data.stepId && wire.sourcePort === port,
  );
  const runState = run
    ? run.ran.has(data.stepId)
      ? run.takenPort(data.stepId) === port
        ? { "data-path-taken": true }
        : { "data-path-untaken": true }
      : { "data-run-faint": true }
    : {};
  return (
    <span
      className={pathPillStyle}
      data-connected={connected || undefined}
      {...runState}
    >
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className={handleStyle}
        style={{ visibility: "hidden" }}
        isConnectable={false}
      />
      {data.label}
      <PortHandle
        stepId={data.stepId}
        id={port}
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{ top: "50%" }}
        isConnectable={false}
        {...pathPortState(document, run, data.stepId, port)}
      >
        <PortAdd stepId={data.stepId} port={port} />
      </PortHandle>
    </span>
  );
};

const StepNodeView = ({ id, selected }: NodeProps<StepNode>) => {
  const { document, ui, setDocument } = useEditor();
  const editable = !useReadOnlyCanvas();
  const [hovered, setHovered] = useState(false);
  const run = nodePathsRun ? demoRun(document) : null;
  const runView = useRunView();
  const enterRef = useEnterAnimation(id);
  const runStars = useRunStars();
  const step = flatFind(document, id);
  if (!step || step.kind !== "action") {
    return null;
  }
  const entry = getCatalogEntry(step.actionDefinitionId);
  // A run draws the editor's own card (Aakarsh, 4 Nov): same size, rows and type; only the bar is added.
  const ports = portRows(step);
  const mark = runView?.steps?.[id];
  // B2 (6 Nov, ?runstars=a|b): in a run, a filled read-only star on a card that holds a featured output.
  const starred =
    Boolean(runView) &&
    runStars !== null &&
    flaggedOutputsOf(document).some((key) => key.startsWith(`${id}.`));
  // `?nodepaths=count`: the rows open while the card is hovered or selected.
  const open = nodePathsTake === "count" && (hovered || selected);
  const portState = (port: string) => pathPortState(document, run, id, port);
  const pathRun = (port: string) =>
    run?.ran.has(id)
      ? run.takenPort(id) === port
        ? { "data-path-taken": true }
        : { "data-path-untaken": true }
      : {};
  return (
    <div
      ref={enterRef}
      className={cardStyle({ selected: selected && !(runView && runSpotlight) })}
      data-run-faint={run && !run.ran.has(id) ? true : undefined}
      // `?nodepaths=chips`: the card grows to hold its chips.
      style={
        nodePathsTake === "chips" && ports
          ? { minHeight: chipsHeight(ports.length) }
          : undefined
      }
      onPointerEnter={
        nodePathsTake === "count" ? () => setHovered(true) : undefined
      }
      onPointerLeave={
        nodePathsTake === "count" ? () => setHovered(false) : undefined
      }
      data-run-state={mark?.state}
      data-read-only={runView ? true : undefined}
      data-flash={ui.flashId === id || undefined}
      data-source-hover={ui.hoverSourceId === id || undefined}
    >
      <PortHandle
        stepId={id}
        id="in"
        type="target"
        position={Position.Left}
        className={handleStyle}
        style={{ top: STEP_HEIGHT / 2 }}
      />
      {starred ? (
        <span
          className={runStarStyle}
          data-run-star
          aria-label="Featured output"
        >
          <Icon name="star" size="xs" />
        </span>
      ) : null}
      {/* No tooltip over the card: the title shows its full text on hover only when it is cut off. */}
      <div className={cardHeadStyle}>
        <CardTile icon={entry?.icon ?? "cube"} tone={entry?.tone ?? "green"} />
        <CardText
          title={entry?.title ?? step.actionDefinitionId}
          titleEnd={<TitleMark state={mark?.state} progress={mark?.progress} />}
          description={
            step.description && step.description !== entry?.title
              ? step.description
              : undefined
          }
          // The same description the panel header edits, so the two stay in step.
          onDescription={
            editable
              ? (value) =>
                  setDocument((current) =>
                    updateStep(current, id, (candidate) => ({
                      ...candidate,
                      description: value,
                    })),
                  )
              : undefined
          }
        />
      </div>
      {ports && nodePathsTake && !(nodePathsTake === "count" && open) ? (
        <NodePaths stepId={id} ports={ports} />
      ) : ports ? (
        <div
          className={css({
            borderTopWidth: "thin",
            borderTopStyle: "solid",
            borderTopColor: "neutral.bd.subtle",
          })}
        >
          {ports.map((port) => (
            <div
              key={port.outputName}
              className={css({
                position: "relative",
                height: "[26px]",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: "3",
                textStyle: "xs",
                color: "neutral.fg.subtle",
              })}
              {...pathRun(port.outputName)}
            >
              {port.label}
              <PortHandle
                stepId={id}
                id={port.outputName}
                type="source"
                position={Position.Right}
                className={handleStyle}
                style={{ top: PORT_ROW / 2 }}
                {...portState(port.outputName)}
              >
                {/* The + sits on the port (J0.5): pressing it and dragging still draws a connection. */}
                <PortAdd stepId={id} port={port.outputName} />
              </PortHandle>
            </div>
          ))}
        </div>
      ) : (
        <>
          <PortHandle
            stepId={id}
            id="next"
            type="source"
            position={Position.Right}
            className={handleStyle}
            style={{ top: STEP_HEIGHT / 2 }}
          >
            {/* The + sits on the port (J0.5): pressing it and dragging still draws a connection. */}
            <PortAdd stepId={id} port="next" />
          </PortHandle>
        </>
      )}
      <ProblemDot stepId={id} />
      <RunDot stepId={id} />
      <RunMark mark={mark} />
    </div>
  );
};

const triggerStyle = css({
  width: "[200px]",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "lg",
  position: "relative",
  "&:hover [data-port-add]": { opacity: "[1]" },
  "&[data-selected] [data-port-add]": { opacity: "[1]" },
  "&[data-source-hover]": {
    boxShadow: "[0 0 0 3px var(--flows-sel-halo)]",
  },
  "&[data-selected]": {
    borderColor: "[var(--flows-sel-border)]",
    boxShadow: "[inset 0 0 0 0.5px var(--flows-sel-border)]",
  },
});

/**
 * `?startrename=old`: Start's "Flow inputs" line as plain text on the card, renamed only in the Start panel. URL
 * only, never remembered.
 */
const oldStartRename =
  new URLSearchParams(globalThis.location.search).get("startrename") === "old";

/** Start: always on the canvas, holds the flow's inputs and lists what starts the flow; steps follow it. */
const StartNodeView = ({ selected }: NodeProps<StepNode>) => {
  const { document, ui, setDocument } = useEditor();
  const editable = !useReadOnlyCanvas();
  const runView = useRunView();
  return (
    <div
      className={triggerStyle}
      data-selected={(selected && !(runView && runSpotlight)) || undefined}
      data-source-hover={ui.hoverSourceId === START_ID || undefined}
    >
      {/* The triggers lead into Start: the ghosts in the editor, the one that fired in a run. */}
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className={handleStyle}
        style={{ top: STEP_HEIGHT / 2 }}
        isConnectable={false}
      />
      <Tooltip content="Start · holds the flow's inputs" position="top">
        <div className={cardHeadStyle}>
          <CardTile icon="play" tone="neutral" />
          {/* Renamed in place like a step's description (ledger 4 Nov), the same field the Start panel edits. */}
          <CardText
            title="Start"
            description={startSubtitle(document)}
            label="Start description"
            onDescription={
              editable && !oldStartRename
                ? (value) =>
                    setDocument((current) => ({
                      ...current,
                      startDescription: value,
                    }))
                : undefined
            }
          />
        </div>
      </Tooltip>
      <PortHandle
        stepId={START_ID}
        id="next"
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{ top: STEP_HEIGHT / 2 }}
      >
        {/* The + sits on the port (J0.5): pressing it and dragging still draws a connection. */}
        <PortAdd stepId={START_ID} port="next" />
      </PortHandle>
      <RunDot stepId={START_ID} />
      <RunMark mark={runView?.steps?.[START_ID]} />
    </div>
  );
};

/**
 * Triggers are read-only (4 Nov): in the editor, one ghost node per kind of trigger sits left of Start, the Start
 * card's head only with a dashed border. A kind that is on is drawn at 50%, one that is off at 25%; the selected one
 * is solid, in the selection colour and opaque. Clicking one opens the Triggers panel.
 */
const ghostStyle = css({
  position: "relative",
  width: "[200px]",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "dashed",
  borderColor: "[var(--flows-ghost-border)]",
  borderRadius: "lg",
  cursor: "pointer",
  opacity: "[0.25]",
  transition: "[opacity 0.15s ease, border-color 0.15s ease]",
  "&[data-on]": { opacity: "[0.5]" },
  _hover: { opacity: "[0.8]" },
  "&[data-selected]": {
    opacity: "[1]",
    borderStyle: "solid",
    borderColor: "[var(--flows-sel-border)]",
    boxShadow: "[inset 0 0 0 0.5px var(--flows-sel-border)]",
  },
});

const GhostTriggerView = ({ id, selected }: NodeProps<StepNode>) => {
  const triggers = useFlowTriggers();
  const kind = ghostKindOf(id);
  if (!kind) {
    return null;
  }
  const summary = ghostSummary(triggers, kind);
  return (
    <div
      className={ghostStyle}
      data-on={summary.on || undefined}
      data-selected={selected || undefined}
      data-ghost-trigger={kind}
    >
      <div className={cardHeadStyle}>
        <CardTile icon={summary.icon} tone="neutral" ghost />
        <CardText title={summary.title} description={summary.line} />
      </div>
      <Handle
        id="next"
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{ top: STEP_HEIGHT / 2 }}
        isConnectable={false}
      />
    </div>
  );
};

/** `?plusopen=c`: the card where the step picked from a port's + will go; `?ghost=` picks its look (plus-open.tsx). */
const plusGhostStyle = cva({
  base: {
    width: "[200px]",
    height: "[59px]",
    backgroundColor: "neutral.bgSolid.min",
    borderWidth: "thin",
    borderRadius: "lg",
    pointerEvents: "none",
  },
  variants: {
    look: {
      today: {
        borderStyle: "dashed",
        borderColor: "[var(--flows-ghost-border)]",
        opacity: "[0.5]",
      },
      // The ghost triggers' g70 (C-007): the step card, solid border, 70%.
      g70: {
        borderStyle: "solid",
        borderColor: "neutral.bd.subtle",
        opacity: "[0.7]",
      },
      // figma-ds _DropzoneFileUpload (21276:17716): bg/subtle/default #fdfdfd fill (21275:17648), dashed border at
      // the hover variant's border-emphasis #00000033 (21276:17833), the code DS's neutral.bd.solid.hover.
      dashed: {
        backgroundColor: "neutral.s05",
        borderStyle: "dashed",
        borderColor: "neutral.bd.solid.hover",
      },
    },
  },
});

const PlusGhostView = () => (
  <div className={plusGhostStyle({ look: plusGhostLook })} data-plus-ghost>
    {plusGhostLook === "g70" ? (
      <div className={cardHeadStyle}>
        <CardTile icon="plus" tone="neutral" ghost />
        <CardText title="New step" />
      </div>
    ) : null}
    <Handle
      id="in"
      type="target"
      position={Position.Left}
      className={handleStyle}
      style={{ visibility: "hidden", top: STEP_HEIGHT / 2 }}
      isConnectable={false}
    />
  </div>
);

/** The wire from the + to the ghost, per `?ghost=`: g70 is the ghost triggers' solid wire. */
const plusGhostWireStyle = (): React.CSSProperties =>
  plusGhostLook === "g70"
    ? { stroke: "var(--colors-neutral-bd-strong)", strokeWidth: 1, opacity: 0.7 }
    : plusGhostLook === "dashed"
      ? {
          stroke: "var(--colors-neutral-bd-strong)",
          strokeWidth: 1,
          strokeDasharray: "3 2",
        }
      : { stroke: "rgba(0, 0, 0, 0.2)", strokeWidth: 1, strokeDasharray: "3 2" };

/* ----------------------------------------------------------------------------------------------------------------
 * Trigger takes (`trigger-flags.ts`): the ghost layouts, the number-based nodes and the no-trigger warning
 * ------------------------------------------------------------------------------------------------------------- */

/** Take 3's rail and Q4 Take 2: one line, 40 px, the count at the right. */
const RAIL_HEIGHT = 40;
const RAIL_WIDTH = 176;

/** Q4 Take 4: the Triggers head, then three 28 px rows; the wire leaves from the Schedule row. */
const SINGLE_HANDLE_TOP = 90;

/** A take's ghost: on is 70%, off 25% (4 Nov call), Start's card otherwise; `?triggerdistinct` sets it apart. */
const ghostTakeStyle = cva({
  base: {
    position: "relative",
    width: "[200px]",
    backgroundColor: "neutral.bgSolid.min",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle",
    borderRadius: "lg",
    cursor: "pointer",
    opacity: "[0.25]",
    transition: "[opacity 0.15s ease, border-color 0.15s ease]",
    "&[data-on]": { opacity: "[0.7]" },
    _hover: { opacity: "[0.9]" },
    "&[data-selected]": {
      opacity: "[1]",
      borderStyle: "solid",
      borderColor: "[var(--flows-sel-border)]",
      boxShadow: "[inset 0 0 0 0.5px var(--flows-sel-border)]",
    },
  },
  variants: {
    distinct: {
      none: {},
      // 1: a dashed outline.
      dashed: {
        borderStyle: "dashed",
        borderColor: "[var(--flows-ghost-border)]",
      },
      // 2: no card, the tile and the words only.
      bare: {
        backgroundColor: "[transparent]",
        borderColor: "[transparent]",
      },
      // 3: a pill.
      pill: { borderRadius: "full", paddingX: "1" },
      // 4: a lighter tone with a "Trigger" eyebrow: the card stays, a step fainter than the other takes.
      tone: { "&[data-on]": { opacity: "[0.5]" } },
    },
    rail: {
      true: { width: "[176px]", height: "[40px]" },
      false: {},
    },
  },
  defaultVariants: { distinct: "none", rail: false },
});

const distinctVariant = {
  1: "dashed",
  2: "bare",
  3: "pill",
  4: "tone",
  5: "none",
} as const;

const GhostTakeView = ({ id, selected }: NodeProps<StepNode>) => {
  const triggers = useFlowTriggers();
  const kind = ghostKindOf(id);
  if (!kind) {
    return null;
  }
  const summary = ghostTakeSummary(triggers, kind);
  const rail = ghostLayout === "rail";
  return (
    <div
      className={ghostTakeStyle({
        distinct: triggerDistinctTake
          ? distinctVariant[triggerDistinctTake as keyof typeof distinctVariant]
          : "none",
        rail,
      })}
      data-on={summary.on || undefined}
      data-selected={selected || undefined}
      data-ghost-trigger={kind}
    >
      {rail ? (
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "2",
            height: "[100%]",
            paddingX: "2",
          })}
        >
          <CardTile icon={summary.icon} tone="neutral" ghost />
          <span
            className={cx(
              oneLineStyle({ tone: "title" }),
              css({ flex: "1", fontWeight: "normal" }),
            )}
          >
            {summary.title}
          </span>
          <span
            className={cx(
              oneLineStyle({ tone: "muted" }),
              css({ fontVariantNumeric: "tabular-nums", paddingRight: "1" }),
            )}
          >
            {summary.count}
          </span>
        </div>
      ) : (
        <div className={cardHeadStyle}>
          <CardTile icon={summary.icon} tone="neutral" ghost />
          {triggerDistinctTake === 4 ? (
            <span
              className={css({
                display: "flex",
                flexDirection: "column",
                minWidth: "[0]",
                flex: "1",
              })}
            >
              <span
                className={css({
                  textStyle: "xxs",
                  lineHeight: "tight",
                  color: "neutral.fg.subtle",
                  paddingBottom: "0.5",
                })}
              >
                Trigger
              </span>
              <CardText title={summary.title} description={summary.line} />
            </span>
          ) : (
            <CardText title={summary.title} description={summary.line} />
          )}
        </div>
      )}
      <Handle
        id="next"
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{
          top: rail ? RAIL_HEIGHT / 2 : STEP_HEIGHT / 2,
          ...(ghostLayout === "fan" ? { opacity: 0 } : {}),
        }}
        isConnectable={false}
      />
    </div>
  );
};

/** Q4 Take 4: one Triggers node, three number rows. A kind that is off reads fainter. */
const GhostSingleView = ({ selected }: NodeProps<StepNode>) => {
  const triggers = useFlowTriggers();
  return (
    <div
      className={ghostTakeStyle({})}
      data-on
      data-selected={selected || undefined}
      data-ghost-trigger="single"
    >
      <div className={cardHeadStyle}>
        <CardTile icon="lightning" tone="neutral" ghost />
        <span
          className={cx(
            oneLineStyle({ tone: "title" }),
            css({ fontWeight: "normal" }),
          )}
        >
          Triggers
        </span>
      </div>
      <div
        className={css({
          display: "flex",
          flexDirection: "column",
          paddingX: "3",
          paddingBottom: "2.5",
        })}
      >
        {ghostKinds.map((kind) => {
          const row = ghostTakeSummary(triggers, kind);
          return (
            <span
              key={kind}
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "2",
                height: "[28px]",
                color: "neutral.fg.muted",
              })}
              style={row.on ? undefined : { opacity: 0.5 }}
            >
              <span
                className={css({
                  display: "inline-flex",
                  width: "[24px]",
                  justifyContent: "center",
                })}
              >
                <Icon name={row.icon} size="sm" />
              </span>
              <span
                className={cx(
                  oneLineStyle({ tone: "title" }),
                  css({ flex: "1", fontWeight: "normal" }),
                )}
              >
                {row.title}
              </span>
              <span
                className={cx(
                  oneLineStyle({ tone: "muted" }),
                  css({ fontVariantNumeric: "tabular-nums" }),
                )}
              >
                {row.count}
              </span>
            </span>
          );
        })}
      </div>
      <Handle
        id="next"
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{ top: SINGLE_HANDLE_TOP }}
        isConnectable={false}
      />
    </div>
  );
};

/** `?triggernone=1`: one quiet line under the ghosts, in the DS orange at a muted step, with the way to fix it. */
const GhostNoteView = () => {
  return (
    <div
      className={css({
        display: "flex",
        alignItems: "flex-start",
        gap: "1.5",
        width: "[200px]",
        paddingX: "1",
        textStyle: "xs",
        lineHeight: "tight",
        color: "orange.fg.subtle",
      })}
      data-trigger-none
    >
      <span className={css({ display: "inline-flex", paddingTop: "[1px]" })}>
        <Icon name="warning" size="xs" />
      </span>
      <span
        className={css({ display: "flex", flexDirection: "column", gap: "1" })}
      >
        <span>Nothing can start this flow</span>
        <button
          type="button"
          className={cx(
            "nodrag nopan",
            css({
              alignSelf: "flex-start",
              color: "neutral.fg.muted",
              textDecoration: "underline",
              cursor: "pointer",
            }),
          )}
          onClick={openTriggersPage}
        >
          Edit flow triggers
        </button>
      </span>
    </div>
  );
};

/** Take 3's rail: each wire bends into one point just before Start and runs in from there as one. */
const GhostMergeEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
}: EdgeProps) => {
  const mergeX = targetX - 56;
  const bend = (mergeX - sourceX) / 2;
  const path = `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${mergeX - bend} ${targetY}, ${mergeX} ${targetY} L ${targetX} ${targetY}`;
  return <BaseEdge id={id} path={path} style={style} />;
};

/** The take's ghost nodes left of Start (`trigger-flags.ts`); take 4's toolbar toggle can hide them. */
const ghostTakeNodes = (
  start: { x: number; y: number },
  selectedId: string | null | undefined,
  show: boolean,
): StepNode[] => {
  if (!show) {
    return [];
  }
  const ghost = (
    kind: (typeof ghostKinds)[number],
    type: "ghostTake" | "ghostSingle",
    x: number,
    y: number,
  ): StepNode => ({
    id: ghostId(kind),
    type,
    position: { x, y },
    data: { stepId: ghostId(kind) },
    selected: selectedId === ghostId(kind),
    draggable: false,
    deletable: false,
  });
  if (ghostLayout === "single") {
    return [
      ghost(
        "schedule",
        "ghostSingle",
        start.x - 300,
        start.y + STEP_HEIGHT / 2 - SINGLE_HANDLE_TOP,
      ),
    ];
  }
  const nodes = ghostKinds.map((kind, index) => {
    switch (ghostLayout) {
      case "rail":
        return ghost(
          kind,
          "ghostTake",
          start.x - 100 - RAIL_WIDTH,
          start.y + (STEP_HEIGHT - RAIL_HEIGHT) / 2 + (index - 1) * 52,
        );
      case "fan":
        return ghost(
          kind,
          "ghostTake",
          index === 1 ? start.x - 300 : start.x - 272,
          start.y + (index - 1) * 104,
        );
      default:
        // Take 4's eyebrow makes each card taller, so the column opens up.
        return ghost(
          kind,
          "ghostTake",
          start.x - 300,
          start.y + (index - 1) * (triggerDistinctTake === 4 ? 92 : 80),
        );
    }
  });
  return triggerNoneTake === 1
    ? [
        ...nodes,
        {
          id: "ghost:none",
          type: "ghostNote",
          position: { x: start.x - 300, y: start.y + 80 + STEP_HEIGHT + 14 },
          data: { stepId: "ghost:none" },
          draggable: false,
          deletable: false,
          selectable: false,
        },
      ]
    : nodes;
};

/** The take's wires into Start: three, a bracket, merged, none (the fan) or one (Q4 Take 4). */
const ghostTakeEdges = (
  triggers: ReturnType<typeof useFlowTriggers>,
  show: boolean,
): Edge[] => {
  if (!show || ghostLayout === "fan") {
    return [];
  }
  const wire = (kind: (typeof ghostKinds)[number], on: boolean): Edge => ({
    id: `ghost-wire:${kind}`,
    source: ghostId(kind),
    sourceHandle: "next",
    target: START_ID,
    targetHandle: "in",
    selectable: false,
    focusable: false,
    ...(ghostLayout === "bracket"
      ? { type: "step" }
      : ghostLayout === "rail"
        ? { type: "ghostMerge" }
        : {}),
    style: {
      stroke: "var(--colors-neutral-bd-strong)",
      strokeWidth: 1,
      // One bracket reads as one line, so its parts share a weight.
      opacity: on || ghostLayout === "bracket" ? 0.7 : 0.3,
      ...(triggerDistinctTake === 5
        ? { strokeDasharray: "0.5 4", strokeLinecap: "round", strokeWidth: 1.5 }
        : {}),
    },
  });
  if (ghostLayout === "single") {
    return [wire("schedule", true)];
  }
  return ghostKinds.map((kind) =>
    wire(kind, ghostTakeSummary(triggers, kind).on),
  );
};

/** `?triggerfired`: what the fired trigger's node says, per take. */
const firedTrigger = (run: RunRecord) => {
  const manual = run.trigger.kind === "manual";
  const title = manual ? "Manual" : "Schedule";
  // Who pressed Run, or which schedule it was.
  const who = manual ? run.trigger.by : "1st of month at 09:00";
  switch (triggerFiredTake) {
    case 3:
      return { title, lines: ["Started this run"] };
    case 4:
      return { title, lines: [who, run.when] };
    default:
      return { title, lines: [who] };
  }
};

const FiredText = ({ fired }: { fired: ReturnType<typeof firedTrigger> }) => (
  <span
    className={css({
      display: "flex",
      flexDirection: "column",
      minWidth: "[0]",
      flex: "1",
    })}
  >
    <span className={oneLineStyle({ tone: "title" })}>{fired.title}</span>
    {fired.lines.map((line) => (
      <span key={line} className={oneLineStyle({ tone: "body" })}>
        {line}
      </span>
    ))}
  </span>
);

/** J6: in a run, only the trigger that fired shows, highlighted, left of Start. */
const RunTriggerView = ({ selected }: NodeProps<StepNode>) => {
  const runView = useRunView();
  if (!runView?.run) {
    return null;
  }
  const label = triggerLabel(runView.run);
  const fired = triggerFiredTake ? firedTrigger(runView.run) : null;
  return (
    <div
      className={cx(
        triggerStyle,
        css({
          borderColor: "neutral.bd.solid",
          "&[data-selected]": { borderColor: "[var(--flows-sel-border)]" },
        }),
      )}
      data-selected={(selected && !runSpotlight) || undefined}
    >
      <div className={cardHeadStyle}>
        <CardTile
          icon={
            runView.run.trigger.kind === "manual" ? "user" : "calendarClock"
          }
          tone="neutral"
        />
        {fired ? (
          <FiredText fired={fired} />
        ) : (
          <CardText
            title={label.title}
            description={label.line}
          />
        )}
      </div>
      <Handle
        id="next"
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{ top: STEP_HEIGHT / 2 }}
        isConnectable={false}
      />
      {/* Take 2's path and take 3's selection carry the highlight; the others keep the done bar. */}
      {triggerFiredTake === 2 || triggerFiredTake === 3 ? null : (
        <RunMark mark={runView.steps?.[runTriggerId]} />
      )}
    </div>
  );
};

const groupStyle = cva({
  base: {
    width: "[100%]",
    height: "[100%]",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.bd.subtle.hover",
    borderRadius: "xl",
    backgroundColor: "[rgba(250, 250, 250, 0.7)]",
    position: "relative",
    "&:hover [data-port-add]": { opacity: "[1]" },
    "&[data-source-hover]": {
      boxShadow: "[0 0 0 3px var(--flows-sel-halo)]",
    },
  },
  variants: {
    selected: {
      true: {
        borderColor: "[var(--flows-sel-border)]",
        boxShadow: "[0 0 0 3px var(--flows-sel-halo)]",
      },
    },
  },
});

/** D17 D: a box names the group; the steps that run per item sit inside it (ledger, 20 Oct). */
const GroupNodeView = ({ id, selected }: NodeProps<StepNode>) => {
  const { document, ui, setUi } = useEditor();
  const runView = useRunView();
  const enterRef = useEnterAnimation(id);
  const step = flatFind(document, id);
  if (!step || step.kind !== "for-each") {
    return null;
  }
  const over = step.over ? describeSource(document, step.over, id) : null;
  const folded = ui.collapsed?.includes(id) ?? false;
  const mark = runView?.steps?.[id];
  return (
    <div
      ref={enterRef}
      className={groupStyle({ selected: selected && !(runView && runSpotlight) })}
      data-run-state={mark?.state}
      data-source-hover={ui.hoverSourceId === id || undefined}
    >
      <PortHandle
        stepId={id}
        id="in"
        type="target"
        position={Position.Left}
        className={handleStyle}
        style={{ top: (folded ? FOLDED_GROUP.height : GROUP_HEADER) / 2 }}
      />
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "2",
          height: "[48px]",
          paddingX: "3",
        })}
      >
        {/* J1.8: a chevron folds the box (J1.13), as the Steps tree's does. */}
        <button
          type="button"
          aria-label={folded ? "Unfold" : "Fold"}
          aria-expanded={!folded}
          className={`${css({
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "[16px]",
            height: "[16px]",
            color: "neutral.fg.muted",
            cursor: "pointer",
            borderRadius: "sm",
            _hover: { backgroundColor: "neutral.bg.surface.active" },
          })} nodrag nopan`}
          onClick={(event) => {
            event.stopPropagation();
            setUi((current) => ({
              ...current,
              collapsed: folded
                ? (current.collapsed ?? []).filter((other) => other !== id)
                : [...(current.collapsed ?? []), id],
            }));
          }}
        >
          <Icon name={folded ? "chevronRight" : "chevronDown"} size="xs" />
        </button>
        <Tooltip
          content={
            over
              ? `${over.owner} › ${over.label}`
              : "Choose the list in the panel"
          }
        >
          <span
            className={css({
              textStyle: "sm",
              fontWeight: "medium",
              color: "neutral.fg.heading",
            })}
          >
            {step.description || "For each"}
          </span>
        </Tooltip>
        <ForEachBoxSwitch stepId={id} />
      </div>
      {step.steps.length === 0 && !folded ? (
        <div
          className={css({
            position: "absolute",
            inset: "[48px 0 0 0]",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <button
            type="button"
            data-group-add={id}
            aria-label="Add step inside"
            className={`${css({
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "[32px]",
              height: "[32px]",
              borderRadius: "full",
              borderWidth: "thin",
              borderStyle: "solid",
              borderColor: "neutral.bd.solid",
              backgroundColor: "neutral.bgSolid.min",
              color: "neutral.fg.muted",
              cursor: "pointer",
              _hover: { backgroundColor: "neutral.bgSolid.surface.active" },
            })} nodrag nopan`}
            onClick={(event) => {
              event.stopPropagation();
              setUi((current) => ({
                ...current,
                picker: { parentId: id, anchor: "group" },
              }));
            }}
          >
            <Icon name="plus" size="sm" />
          </button>
        </div>
      ) : null}
      <PortHandle
        stepId={id}
        id="next"
        type="source"
        position={Position.Right}
        className={handleStyle}
        // J6 draws a run's For each leaving from the middle of its right edge, level with the step after it.
        style={{
          top:
            runView && !folded
              ? "50%"
              : (folded ? FOLDED_GROUP.height : GROUP_HEADER) / 2,
        }}
      >
        {/* The + sits on the port (J0.5): pressing it and dragging still draws a connection. */}
        <PortAdd stepId={id} port="next" />
      </PortHandle>
      <ProblemDot stepId={id} />
      <RunDot stepId={id} />
      <RunMark mark={mark} group />
    </div>
  );
};

const nodeTypes = {
  step: StepNodeView,
  start: StartNodeView,
  forEach: GroupNodeView,
  trigger: RunTriggerView,
  ghost: GhostTriggerView,
  ghostTake: GhostTakeView,
  ghostSingle: GhostSingleView,
  ghostNote: GhostNoteView,
  flowOutputs: ({ selected }: NodeProps<StepNode>) => (
    <FlowOutputsCard selected={selected} />
  ),
  pathPill: PathPillNodeView,
  plusGhost: PlusGhostView,
};

const wireLabelStyle = css({
  position: "absolute",
  paddingX: "1",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "sm",
  backgroundColor: "neutral.bgSolid.min",
  textStyle: "xs",
  lineHeight: "[16px]",
  color: "neutral.fg.muted",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  "&[data-faint]": { opacity: "[0.55]" },
});

const edgeCloseStyle = css({
  position: "absolute",
  pointerEvents: "all",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[16px]",
  height: "[16px]",
  borderRadius: "full",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "[var(--flows-sel-border)]",
  color: "neutral.fg.heading",
  cursor: "pointer",
});

/**
 * A connection (2 Nov vocabulary). Hovering it shows a small × that disconnects it (Explorations U12 C); it turns blue
 * while hovered or while its right-click menu is open (J1.20).
 */
const FlowEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
}: EdgeProps) => {
  const { ui, setUi, setDocument } = useEditor();
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const menuOpen =
    ui.canvasMenu?.kind === "connection" && ui.canvasMenu.wireId === id;
  const hovered = ui.hoverWireId === id;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={16}
        style={
          menuOpen || hovered
            ? { ...style, stroke: "var(--flows-sel-border)" }
            : style
        }
      />
      {/* `?nodepaths=wires`: the path's name on its wire; the × takes its place while hovered. */}
      {typeof data?.label === "string" && !(hovered && !menuOpen) ? (
        <EdgeLabelRenderer>
          <span
            className={wireLabelStyle}
            data-faint={data.faint === true || undefined}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data.label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
      {hovered && !menuOpen ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label="Disconnect"
            className={`${edgeCloseStyle} nodrag nopan`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            onPointerEnter={() =>
              setUi((current) => ({ ...current, hoverWireId: id }))
            }
            onPointerLeave={() =>
              setUi((current) => ({ ...current, hoverWireId: null }))
            }
            onClick={(event) => {
              event.stopPropagation();
              setDocument((current) => ({
                ...current,
                wires: current.wires.filter((wire) => wire.id !== id),
              }));
              setUi((current) => ({ ...current, hoverWireId: null }));
            }}
          >
            <Icon name="close" size="xxs" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
};

const edgeTypes = { flow: FlowEdge, ghostMerge: GhostMergeEdge };

/** Wires touching any of these steps. */
const touching =
  (ids: string[]) => (wire: { source: string; target: string }) =>
    ids.includes(wire.source) || ids.includes(wire.target);

/**
 * The canvas's right-click menus. J1.16 a step: Disconnect from previous, Disconnect all, then Delete step, as
 * Backspace does (3 Nov); menus show no shortcut glyphs (12 Nov). A box selection: Disconnect all. J1.20 a connection: Disconnect, Insert step here. J1.21 a
 * port: Disconnect, Disconnect all. Connections and ports have no Delete (2 Nov).
 */
const useCanvasMenuItems = (
  menu: CanvasMenu | null | undefined,
  flowId: string | undefined,
  onCopied: () => void,
): Array<ItemOrGroup<MenuItem>> => {
  const { document, setDocument, setUi } = useEditor();
  const dropWires = (
    keep: (wire: (typeof document.wires)[number]) => boolean,
  ) => {
    setDocument((current) => ({
      ...current,
      wires: current.wires.filter(keep),
    }));
    setUi((current) => ({ ...current, canvasMenu: null }));
  };
  // ds-icons has no broken-link glyph; the plug stands in for Figma's unlink.
  if (!menu) {
    // Never shown, and says nothing: it keeps the DS menu mounted (an empty list unmounts it, and the canvas with
    // it). Every right-click with no actions stops before the menu and gets the browser's own.
    return [{ id: "none", text: "", disabled: true, onClick: () => undefined }];
  }
  return (() => {
    if (menu.kind === "runStep") {
      const close = () =>
        setUi((current) => ({ ...current, canvasMenu: null }));
      return [
        {
          id: "show-in-log",
          text: "Show in log",
          icon: "list",
          onClick: () => {
            close();
            // The step leaves the URL first, so the selection doesn't come back from it and hide the log.
            setQuery("step", null);
            setQuery("panel", "log");
            // The log is the right panel when no step is selected; it opens the step's rows and marks them.
            setUi((current) => ({
              ...current,
              runLog: true,
              selectedId: null,
              selectedIds: [],
              logReveal: { stepId: menu.stepId, at: Date.now() },
            }));
            setTimeout(() => flashLogRows(menu.stepId), 120);
          },
        },
        {
          id: "open-in-editor",
          text: "Open step in editor",
          icon: "arrowUpRight",
          onClick: () => {
            close();
            if (flowId) {
              navigate(`/flows/${flowId}?step=${menu.stepId}`);
            }
          },
        },
        {
          id: "copy-link",
          text: "Copy link to node",
          icon: "copy",
          onClick: () => {
            close();
            const url = new URL(globalThis.location.href);
            url.searchParams.set("step", menu.stepId);
            void globalThis.navigator.clipboard
              ?.writeText(url.toString())
              .catch(() => undefined);
            onCopied();
          },
        },
      ];
    }
    if (menu.kind === "step") {
      const incoming = document.wires.some(
        (wire) => wire.target === menu.stepId,
      );
      const any = document.wires.some(touching([menu.stepId]));
      const connections: MenuItem[] = [
        {
          id: "previous",
          text: "Disconnect from previous",
          icon: "plug",
          disabled: !incoming,
          onClick: () => dropWires((wire) => wire.target !== menu.stepId),
        },
        {
          id: "all",
          text: "Disconnect all",
          icon: "close",
          disabled: !any,
          onClick: () => dropWires((wire) => !touching([menu.stepId])(wire)),
        },
      ];
      if (menu.stepId === START_ID) {
        return connections;
      }
      return [
        { id: "connections", label: "", items: connections },
        {
          id: "delete",
          label: "",
          items: [
            {
              id: "delete",
              text: "Delete step",
              icon: "trash",
              onClick: () => {
                setDocument((current) => removeStep(current, menu.stepId));
                setUi((current) => ({
                  ...current,
                  canvasMenu: null,
                  selectedId:
                    current.selectedId === menu.stepId
                      ? null
                      : current.selectedId,
                  selectedIds: (current.selectedIds ?? []).filter(
                    (id) => id !== menu.stepId,
                  ),
                }));
              },
            },
          ],
        },
      ];
    }
    if (menu.kind === "selection") {
      return [
        {
          id: "all",
          text: "Disconnect all",
          icon: "close",
          disabled: !document.wires.some(touching(menu.stepIds)),
          onClick: () => dropWires((wire) => !touching(menu.stepIds)(wire)),
        },
      ];
    }
    if (menu.kind === "connection") {
      const wire = document.wires.find(
        (candidate) => candidate.id === menu.wireId,
      );
      return [
        {
          id: "disconnect",
          text: "Disconnect",
          icon: "plug",
          onClick: () => dropWires((candidate) => candidate.id !== menu.wireId),
        },
        {
          id: "insert",
          text: "Insert step here",
          icon: "plus",
          disabled: !wire,
          onClick: () => {
            if (!wire) {
              return;
            }
            // Opened after this menu has closed, so the two DS menus don't fight over focus.
            setTimeout(
              () =>
                setUi((current) => ({
                  ...current,
                  canvasMenu: null,
                  picker: {
                    after: { stepId: wire.source, port: wire.sourcePort },
                    anchor: "drop",
                    drop: {
                      client: menu.point,
                      flow: {
                        x: menu.flow.x,
                        y: menu.flow.y - STEP_HEIGHT / 2,
                      },
                    },
                    insertInto: wire.id,
                  },
                })),
              300,
            );
          },
        },
      ];
    }
    const atPort = (wire: (typeof document.wires)[number]) =>
      menu.side === "source"
        ? wire.source === menu.stepId && wire.sourcePort === menu.port
        : wire.target === menu.stepId;
    const first = document.wires.find(atPort);
    return [
      {
        id: "disconnect",
        text: "Disconnect",
        icon: "plug",
        disabled: !first,
        onClick: () => dropWires((wire) => wire.id !== first?.id),
      },
      {
        id: "all",
        text: "Disconnect all",
        icon: "close",
        disabled: !first,
        onClick: () => dropWires((wire) => !atPort(wire)),
      },
    ];
  })();
};

/**
 * No browser focus ring on the canvas itself (a mouse click can focus the pane, and Edge draws its own ring there),
 * and React Flow's selection box in DS blue rather than its default violet. Keyboard focus on a node keeps the DS ring.
 */
const canvasStyle = css({
  // A step selected in a run (Spotlight): every other card and every wire drops to the faint rule; the selected card
  // keeps its unselected look and its bar in full colour.
  "&[data-run-spotlight] .react-flow__node:not(.selected) > *, &[data-run-spotlight] .react-flow__edge":
    { opacity: "[0.45]" },
  // A screen state draws the + beside a step on hover only (Figma J2 A and B2 show it beside the selected step).
  "&[data-quiet-port-add] [data-port-add]": { opacity: "[0]" },
  "&[data-quiet-port-add] .react-flow__node:hover [data-port-add]": {
    opacity: "[1]",
  },
  "&, & .react-flow__renderer, & .react-flow__pane, & .react-flow__viewport": {
    outline: "none",
  },
  "& .react-flow__node:focus:not(:focus-visible), & .react-flow__edge:focus:not(:focus-visible)":
    { outline: "none" },
  "& .react-flow__node:focus-visible": {
    outline: "[2px solid var(--flows-sel-border)]",
    outlineOffset: "[2px]",
    borderRadius: "lg",
  },
  "& .react-flow__selection, & .react-flow__nodesselection-rect": {
    backgroundColor: "[var(--flows-sel-row)]",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "[var(--flows-sel-border)]",
  },
  // missing-multiselect b (13 Nov): once the drag ends, each selected card shows selected; no box around them.
  "&[data-multiselect=cards] .react-flow__nodesselection-rect": {
    display: "none",
  },
});

/** Leaves room for the bottom bar, and keeps text readable on a big flow. The panel is docked beside the canvas. */
const fitOptions = {
  padding: { top: "48px", left: "48px", bottom: "96px", right: "48px" },
  maxZoom: 1,
  minZoom: 0.6,
} as const;

/** A run (or a past version) shows the whole flow between the side panels, 48 px in, above the bottom bar. */
const wholeFlowFit = {
  padding: { top: "48px", left: "48px", bottom: "96px", right: "48px" },
  maxZoom: 1,
  minZoom: 0.2,
} as const;

/** The least a run opens at: a card's 13 px title still reads (8 px on screen), as the editor's own fit floor. */
const runMinZoom = 0.6;

export const FlowCanvas = ({
  onInit,
  mode = "select",
  flowId,
}: {
  onInit: (fitView: () => void, zoom: (by: number) => void) => void;
  /** A routed flow: the editor reopens at the viewport it was left at (a reload does not re-fit). */
  flowId?: string;
  /** Hand pans on drag; Select drags a selection box (and pans with the middle or right button). */
  mode?: "select" | "hand";
}) => {
  const { document, setDocument, ui, setUi } = useEditor();
  const runView = useRunView();
  // A run, or a past version open from the version menu (V6), is read-only.
  const viewingVersion = useLocation().query.has("version");
  const readOnly = Boolean(runView) || viewingVersion;
  const flowTake = useFlowOutputTake();
  const highlight = useHighlightedSteps();
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  // Each node's size as React Flow measured it, handed back on the nodes so the minimap can draw them.
  const [measured, setMeasured] = useState<
    Record<string, { width: number; height: number }>
  >({});

  const flow = useReactFlow<StepNode>();
  // The mouse-up that ends a wire on empty canvas is also a click on the pane; it must not close the menu it opens.
  const droppedAt = useRef(0);
  // On first load, wait for the initial fit to finish before panning to the selection.
  const loaded = useRef(false);
  // The editor's last viewport for this flow, kept across reloads. A run keeps its J6 framing.
  const [savedViewport] = useState(() =>
    flowId && !readOnly ? getViewport(flowId) : undefined,
  );
  // A screen opened at a set viewport (a Figma frame, or where it was left) stays there; it does not pan to its selection.
  const placed = useRef(!!ui.viewport || !!savedViewport);

  // A step added for the user flashes for a moment, then the highlight clears.
  useEffect(() => {
    if (!ui.flashId) {
      return;
    }
    const timer = setTimeout(
      () => setUi((current) => ({ ...current, flashId: null })),
      1800,
    );
    return () => clearTimeout(timer);
  }, [ui.flashId, setUi]);

  // A step's entry animation runs once; clear the mark so a remount (folding a group) does not replay it.
  useEffect(() => {
    if (!ui.enterId) {
      return;
    }
    const timer = setTimeout(
      () => setUi((current) => ({ ...current, enterId: null })),
      400,
    );
    return () => clearTimeout(timer);
  }, [ui.enterId, setUi]);

  // Keep the selected step (or one just added) in view; the panel is docked beside the canvas.
  const focusId = ui.flashId ?? ui.selectedId;
  useEffect(() => {
    const delay = loaded.current ? 150 : 600;
    const firstLoad = !loaded.current;
    loaded.current = true;
    if (!focusId || (firstLoad && placed.current)) {
      return;
    }
    const timer = setTimeout(() => {
      const node = flow.getInternalNode(focusId);
      const pane = globalThis.document
        .querySelector(".react-flow")
        ?.getBoundingClientRect();
      if (!node || !pane) {
        return;
      }
      const { x, y, zoom } = flow.getViewport();
      const position = node.internals.positionAbsolute;
      const width = node.measured.width ?? STEP_WIDTH;
      const height = node.measured.height ?? 64;
      const left = position.x * zoom + x;
      const right = (position.x + width) * zoom + x;
      const top = position.y * zoom + y;
      const bottom = (position.y + height) * zoom + y;
      const visibleRight = pane.width - 24;
      if (
        left < 24 ||
        right > visibleRight ||
        top < 24 ||
        bottom > pane.height - 96
      ) {
        flow
          .setCenter(position.x + width / 2, position.y + height / 2, {
            zoom,
            duration: 200,
          })
          .catch(() => undefined);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [focusId, flow]);

  const [startViewport] = useState(() => {
    const start = document.positions[START_ID] ?? { x: 360, y: 220 };
    if (savedViewport) {
      return savedViewport;
    }
    // Read-only: fit the whole flow instead of a set framing (the J6 framing cut off the last step).
    return ui.viewport && !readOnly
      ? {
          x: ui.viewport.left - start.x * ui.viewport.zoom,
          y: ui.viewport.top - start.y * ui.viewport.zoom,
          zoom: ui.viewport.zoom,
        }
      : undefined;
  });

  // A run fits the flow between the side panels, never below runMinZoom. Held at the floor, the flow's left end (the
  // trigger, then Start) sits 48 px in, centred top to bottom, and the rest pans.
  const store = useStoreApi<StepNode>();
  const nodesReady = useNodesInitialized();
  const runFitted = useRef(false);
  const fitRun = () => {
    const { width, height } = store.getState();
    const bounds = flow.getNodesBounds(flow.getNodes());
    if (bounds.width === 0 || width === 0) {
      return;
    }
    const fit = Math.min(
      (width - 96) / bounds.width,
      (height - 144) / bounds.height,
      1,
    );
    const zoom = Math.max(fit, runMinZoom);
    flow
      .setViewport({
        x:
          fit >= runMinZoom
            ? (width - bounds.width * zoom) / 2 - bounds.x * zoom
            : 48 - bounds.x * zoom,
        y: 48 + (height - 144 - bounds.height * zoom) / 2 - bounds.y * zoom,
        zoom,
      })
      .catch(() => undefined);
  };
  useEffect(() => {
    if (!readOnly || viewingVersion) {
      runFitted.current = false;
      return;
    }
    if (startViewport || runFitted.current || !nodesReady) {
      return;
    }
    runFitted.current = true;
    fitRun();
  });

  const [copied, setCopied] = useState(false);
  const canvasMenuItems = useCanvasMenuItems(ui.canvasMenu, flowId, () =>
    setCopied(true),
  );
  // A menu's highlight (the port or connection it is for) clears on the next press or Escape.
  useEffect(() => {
    if (!ui.canvasMenu) {
      return;
    }
    const clear = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") {
        return;
      }
      // A press inside the menu is a pick; its own handler clears the target.
      if (
        event instanceof PointerEvent &&
        (event.button === 2 ||
          (event.target as Element | null)?.closest?.('[role="menu"]'))
      ) {
        return;
      }
      setUi((current) => ({ ...current, canvasMenu: null }));
    };
    const timer = setTimeout(() => {
      globalThis.addEventListener("pointerdown", clear);
      globalThis.addEventListener("keydown", clear);
    }, 0);
    return () => {
      clearTimeout(timer);
      globalThis.removeEventListener("pointerdown", clear);
      globalThis.removeEventListener("keydown", clear);
    };
  }, [ui.canvasMenu, setUi]);

  // `?plusopen=c`: while the picker from a port's + is open, a ghost step holds the spot the new step lands in.
  const plusAfter =
    plusOpenTake === "c" &&
    !readOnly &&
    !pickerTake() &&
    ui.picker?.anchor === "port" &&
    !ui.picker.feed
      ? ui.picker.after
      : undefined;
  const plusFrom = plusAfter
    ? findStep(document, plusAfter.stepId)?.step
    : undefined;
  const dragged = {
    ...document,
    positions: { ...document.positions, ...dragPositions },
  };
  const stepNodes = toNodes(
    plusAfter ? withPlusGhost(dragged, plusAfter, ui.collapsed ?? []) : dragged,
    ui.selectedId,
    ui.collapsed,
    ui.selectedIds,
  ).map((node) =>
    node.id === PLUS_GHOST_ID
      ? {
          ...node,
          type: "plusGhost" as const,
          selectable: false,
          draggable: false,
          deletable: false,
          focusable: false,
        }
      : node,
  );
  const start = document.positions[START_ID] ?? { x: 360, y: 220 };
  const flowTriggers = useFlowTriggers();
  const showTriggers = useShowTriggers();
  // A run is read-only, and shows the trigger that fired left of Start (J6).
  const nodes: StepNode[] = readOnly
    ? [
        {
          id: runTriggerId,
          type: "trigger",
          position: { x: start.x - 300, y: start.y },
          data: { stepId: runTriggerId },
          selected: ui.selectedId === runTriggerId,
          deletable: false,
        },
        ...stepNodes.map((node) => ({ ...node, deletable: false })),
      ]
    : [
        // Stacked 1.33 cards apart, centred on Start, half a card width left of it.
        ...(ghostLayout
          ? ghostTakeNodes(start, ui.selectedId, showTriggers)
          : ghostKinds.map((kind, index) => ({
              id: ghostId(kind),
              type: "ghost" as const,
              position: { x: start.x - 300, y: start.y + (index - 1) * 80 },
              data: { stepId: ghostId(kind) },
              selected: ui.selectedId === ghostId(kind),
              draggable: false,
              deletable: false,
            }))),
        ...stepNodes,
        // ?flowoutput=5: the Outputs card, one card width after the right-most top-level step.
        ...(flowTake === 5
          ? [
              {
                id: FLOW_OUTPUTS_ID,
                type: "flowOutputs" as const,
                position: {
                  x:
                    Math.max(
                      start.x,
                      ...stepNodes
                        .filter((node) => !node.parentId)
                        .map((node) => node.position.x),
                    ) + 320,
                  y: start.y,
                },
                data: { stepId: FLOW_OUTPUTS_ID },
                selected: ui.selectedId === FLOW_OUTPUTS_ID,
                draggable: false,
                deletable: false,
              },
            ]
          : []),
      ];
  const edges: Edge[] = [
    ...(readOnly
      ? [
          {
            id: "run-trigger",
            source: runTriggerId,
            sourceHandle: "next",
            target: START_ID,
            targetHandle: "in",
            type: "flow",
            // ?triggerfired=2: the path the run took, in the done colour.
            style:
              triggerFiredTake === 2
                ? { stroke: "var(--flows-node-doneBar)", strokeWidth: 2 }
                : { stroke: "rgba(0, 0, 0, 0.2)", strokeWidth: 1.5 },
          },
        ]
      : ghostLayout
        ? ghostTakeEdges(flowTriggers, showTriggers)
        : ghostKinds.map((kind) => ({
            id: `ghost-wire:${kind}`,
            source: ghostId(kind),
            sourceHandle: "next",
            target: START_ID,
            targetHandle: "in",
            selectable: false,
            focusable: false,
            style: {
              stroke: "rgba(0, 0, 0, 0.2)",
              strokeWidth: 1,
              strokeDasharray: "3 2",
            },
          }))),
    ...toEdges(document, ui.collapsed),
    ...(plusAfter
      ? [
          {
            id: "plus-ghost-wire",
            source:
              nodePathsTake === "pills" &&
              plusFrom &&
              portRows(plusFrom)
                ? pillId(plusAfter.stepId, plusAfter.port)
                : plusAfter.stepId,
            sourceHandle: plusAfter.port,
            target: PLUS_GHOST_ID,
            targetHandle: "in",
            selectable: false,
            focusable: false,
            style: plusGhostWireStyle(),
          },
        ]
      : []),
  ];

  const onNodesChange = (changes: NodeChange<StepNode>[]) => {
    const sized = changes.flatMap((change) =>
      change.type === "dimensions" && change.dimensions
        ? [[change.id, change.dimensions] as const]
        : [],
    );
    if (sized.length > 0) {
      setMeasured((current) => ({ ...current, ...Object.fromEntries(sized) }));
    }
    const moving: Record<string, { x: number; y: number }> = {};
    const settled: Record<string, { x: number; y: number }> = {};
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        if (change.dragging) {
          moving[change.id] = change.position;
        } else {
          settled[change.id] = change.position;
        }
      }
    }
    // Box selection (drag on empty canvas, J1.17): React Flow reports each step it takes in or lets go of.
    const selects = changes.filter((change) => change.type === "select");
    if (selects.length > 0) {
      setUi((current) => {
        const next = new Set(
          current.selectedIds ??
            (current.selectedId ? [current.selectedId] : []),
        );
        for (const change of selects) {
          if (change.selected) {
            next.add(change.id);
          } else {
            next.delete(change.id);
          }
        }
        const selectedIds = [...next];
        return {
          ...current,
          selectedIds,
          selectedId:
            selectedIds.length === 1
              ? selectedIds[0]!
              : selectedIds.includes(current.selectedId ?? "")
                ? current.selectedId
                : (selectedIds[0] ?? null),
        };
      });
    }
    if (Object.keys(moving).length > 0) {
      setDragPositions((previous) => ({ ...previous, ...moving }));
    }
    if (Object.keys(settled).length > 0) {
      setDocument((current) => ({
        ...current,
        positions: { ...current.positions, ...settled },
      }));
    }
  };

  const onNodeDragStop = (_: unknown, node: StepNode) => {
    setDocument((current) => ({
      ...current,
      positions: { ...current.positions, [node.id]: node.position },
    }));
    setDragPositions({});
  };

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) {
      return;
    }
    setDocument((current) => ({
      ...current,
      wires: [
        ...current.wires,
        {
          id: `${connection.source}:${connection.sourceHandle ?? "next"}->${connection.target}`,
          source: connection.source,
          sourcePort: connection.sourceHandle ?? "next",
          target: connection.target,
        },
      ],
    }));
  };

  /** A wire released on empty canvas opens the add-step menu there; the new step is wired from the port it came from. */
  const onConnectEnd = (
    event: MouseEvent | TouchEvent,
    state: {
      isValid: boolean | null;
      fromNode: { id: string } | null;
      fromHandle: { id?: string | null } | null;
    },
  ) => {
    if (state.isValid || !state.fromNode || !state.fromHandle) {
      return;
    }
    const point =
      "changedTouches" in event
        ? {
            x: event.changedTouches[0]!.clientX,
            y: event.changedTouches[0]!.clientY,
          }
        : { x: event.clientX, y: event.clientY };
    droppedAt.current = Date.now();
    const flowPoint = flow.screenToFlowPosition(point);
    const stepId = state.fromNode.id;
    setUi((current) => ({
      ...current,
      picker: {
        after: { stepId, port: state.fromHandle?.id ?? "next" },
        anchor: "drop",
        drop: {
          client: point,
          flow: { x: flowPoint.x, y: flowPoint.y - STEP_HEIGHT / 2 },
        },
      },
    }));
  };

  const canvas = (
    <ReactFlow
      className={canvasStyle}
      data-multiselect="cards"
      nodes={withHighlight(
        nodes.map((node) =>
          measured[node.id] ? { ...node, measured: measured[node.id] } : node,
        ),
        highlight,
      )}
      edges={edges}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      onConnectEnd={onConnectEnd}
      edgeTypes={edgeTypes}
      onNodeClick={(_, node) =>
        setUi((current) => ({
          ...current,
          selectedId: node.id,
          selectedIds: [node.id],
          triggerId: null,
          openField: null,
        }))
      }
      onNodeContextMenu={(event, node) => {
        // A step in a run has its three run actions; the trigger and the For each box have none.
        if (
          runView &&
          !viewingVersion &&
          (node.type === "step" || node.type === "start")
        ) {
          setUi((current) => ({
            ...current,
            picker: null,
            canvasMenu: {
              kind: "runStep",
              stepId: node.id,
              point: { x: event.clientX, y: event.clientY },
            },
          }));
          return;
        }
        // Nothing to do on a read-only or ghost node: the browser's own menu, never an empty custom one.
        if (readOnly || node.type === "ghost") {
          event.stopPropagation();
          return;
        }
        // A port inside the step has its own menu (J1.21).
        if ((event.target as Element).closest(".react-flow__handle")) {
          return;
        }
        const point = { x: event.clientX, y: event.clientY };
        setUi((current) => {
          const group = current.selectedIds ?? [];
          return group.length > 1 && group.includes(node.id)
            ? {
                ...current,
                picker: null,
                canvasMenu: { kind: "selection", stepIds: group, point },
              }
            : {
                ...current,
                picker: null,
                selectedId: node.id,
                selectedIds: [node.id],
                triggerId: null,
                openField: null,
                canvasMenu: { kind: "step", stepId: node.id, point },
              };
        });
      }}
      onSelectionContextMenu={(event, selected) => {
        setUi((current) => ({
          ...current,
          picker: null,
          canvasMenu: {
            kind: "selection",
            stepIds: selected.map((node) => node.id),
            point: { x: event.clientX, y: event.clientY },
          },
        }));
      }}
      onEdgeContextMenu={(event, edge) => {
        if (readOnly || edge.id.startsWith("ghost-wire:")) {
          event.stopPropagation();
          return;
        }
        const point = { x: event.clientX, y: event.clientY };
        setUi((current) => ({
          ...current,
          picker: null,
          hoverWireId: null,
          canvasMenu: {
            kind: "connection",
            wireId: edge.id,
            point,
            flow: flow.screenToFlowPosition(point),
          },
        }));
      }}
      onPaneContextMenu={(event) => {
        // Empty canvas has no actions: keep the right-click from the custom menu; the browser's own shows.
        event.stopPropagation();
      }}
      onEdgeMouseEnter={(_, edge) =>
        readOnly
          ? undefined
          : setUi((current) => ({ ...current, hoverWireId: edge.id }))
      }
      onEdgeMouseLeave={() =>
        setUi((current) => ({ ...current, hoverWireId: null }))
      }
      onPaneClick={() => {
        if (Date.now() - droppedAt.current < 400) {
          return;
        }
        setUi((current) => ({
          ...current,
          selectedId: null,
          selectedIds: [],
          picker: null,
          openField: null,
          canvasMenu: null,
        }));
      }}
      // Delete / Backspace deletes the selected steps; a step's right-click menu has Delete step too.
      onNodesDelete={(deleted) => {
        const ids = deleted.map((node) => node.id);
        setDocument((current) =>
          ids.reduce((next, id) => removeStep(next, id), current),
        );
        setUi((current) => ({
          ...current,
          selectedId: ids.includes(current.selectedId ?? "")
            ? null
            : current.selectedId,
          selectedIds: (current.selectedIds ?? []).filter(
            (id) => !ids.includes(id),
          ),
        }));
      }}
      onEdgesDelete={(deleted) =>
        setDocument((current) => ({
          ...current,
          wires: current.wires.filter(
            (wire) => !deleted.some((edge) => edge.id === wire.id),
          ),
        }))
      }
      onInit={(instance) => {
        // Dev: headless checks centre the canvas on a step (`__flowsCanvas.setCenter`).
        if (import.meta.env.DEV) {
          (globalThis as { __flowsCanvas?: unknown }).__flowsCanvas = instance;
        }
        onInit(
          () => {
            if (readOnly && !viewingVersion) {
              fitRun();
              return;
            }
            instance
              .fitView(readOnly ? wholeFlowFit : fitOptions)
              .catch(() => undefined);
          },
          (by) => {
            instance.zoomTo(instance.getZoom() * by).catch(() => undefined);
          },
        );
      }}
      data-quiet-port-add={(ui.quietPortAdd && !showFull) || undefined}
      data-run-spotlight={
        (runSpotlight && runView && ui.selectedId !== null && ui.selectedId !== undefined) ||
        undefined
      }
      // A click on a port is the + on it (J0.5), not the start of a click-to-connect.
      connectOnClick={false}
      // `?plusopen=c`: the picker stays where it opened, so panning or zooming by hand closes it and its ghost.
      onMoveStart={(event) => {
        if (event && plusAfter) {
          setUi((current) => ({ ...current, picker: null }));
        }
      }}
      onMoveEnd={(_event, viewport) => {
        if (flowId && !readOnly) {
          saveViewport(flowId, viewport);
        }
      }}
      fitView={!startViewport && (!readOnly || viewingVersion)}
      fitViewOptions={readOnly ? wholeFlowFit : fitOptions}
      defaultViewport={startViewport}
      // A run has nothing to select, so a drag pans. The editor pans with the middle button, space or the hand, never
      // the right one: React Flow swallows every right-click on the pane when the right button pans, which hid the
      // browser's own menu on empty canvas.
      panOnDrag={readOnly || mode === "hand" ? true : [1]}
      selectionOnDrag={mode === "select"}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
    >
      {/* ↳ Current's canvas: a light dot grid, and a minimap at the top right. */}
      <Background
        variant={BackgroundVariant.Dots}
        gap={16}
        size={1}
        color="var(--colors-neutral-bd-solid)"
      />
      <MiniMap
        position="top-right"
        pannable
        zoomable
        ariaLabel="Minimap"
        style={{ width: 100, height: 64, borderRadius: 6 }}
        maskColor="rgba(0, 0, 0, 0.08)"
        // DS neutrals: a For each box as a faint area, the steps as solid grey cards on it.
        nodeColor={(node) =>
          node.type === "forEach"
            ? "var(--colors-neutral-bg-subtle)"
            : "var(--colors-neutral-bd-solid)"
        }
        nodeStrokeColor="var(--colors-neutral-bd-subtle)"
      />
    </ReactFlow>
  );
  const toast = copied ? (
    <Toast text="Link copied" onDone={() => setCopied(false)} />
  ) : null;
  // A past version has no actions on any target, so no custom menu at all.
  if (viewingVersion) {
    return canvas;
  }
  return (
    <>
      {/* One DS right-click menu for the canvas; what was right-clicked (set by the handlers) decides its rows. */}
      <RightClickMenu
        items={canvasMenuItems}
        className={css({ minWidth: "[240px]" })}
      >
        {/* A right-click on anything with no actions (empty canvas, the For each box, a run's wires and ports)
            stops here, so the browser's own menu shows instead of an empty custom one. */}
        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- only routes the right-click */}
        <div
          style={{ display: "contents" }}
          onContextMenu={(event) => {
            const target = event.target as Element;
            const actionable = readOnly
              ? target.closest(
                  ".react-flow__node-step, .react-flow__node-start",
                )
              : target.closest(
                  ".react-flow__node:not(.react-flow__node-ghost), .react-flow__edge, .react-flow__handle, .react-flow__nodesselection-rect",
                );
            if (!actionable) {
              event.stopPropagation();
            }
          }}
        >
          {canvas}
        </div>
      </RightClickMenu>
      {toast}
    </>
  );
};

export { stepTitle };
