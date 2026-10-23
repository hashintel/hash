import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  type Connection,
  type Edge,
  Handle,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import { Icon, type IconName, Tooltip } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { getCatalogEntry } from "./catalog";
import {
  START_ID,
  type DraftStep,
  type EditorDocument,
  removeStep,
  startSubtitle,
  stepTitle,
} from "./document";
import { showDebug, useEditor } from "./editor-context";
import { describeSource } from "./shapes";
import { IconTile } from "./ui";

// The V7 card on ↳ Current: 200 wide, 12 px in, a 24 px tile and two lines (59 px with its border).
export const STEP_WIDTH = 200;
const STEP_HEIGHT = 59;
const PORT_ROW = 26;
const GROUP_HEADER = 48;
const GROUP_PADDING = 32;

type StepData = { stepId: string };
type StepNode = Node<StepData, "step" | "forEach" | "start">;

const portRows = (step: DraftStep) =>
  step.kind === "action"
    ? (getCatalogEntry(step.actionDefinitionId)?.ports ?? null)
    : null;

const stepHeight = (step: DraftStep) => {
  const ports = portRows(step);
  return ports ? STEP_HEIGHT + ports.length * PORT_ROW : STEP_HEIGHT;
};

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

const toNodes = (document: EditorDocument, selectedId: string | null) => {
  const nodes: StepNode[] = [
    {
      id: START_ID,
      type: "start",
      position: document.positions[START_ID] ?? { x: 360, y: 220 },
      data: { stepId: START_ID },
      selected: selectedId === START_ID,
      // Start holds the flow's inputs, so it stays.
      deletable: false,
    },
  ];
  const visit = (steps: DraftStep[], parentId?: string) => {
    for (const step of steps) {
      const size =
        step.kind === "for-each" ? groupSize(document, step) : undefined;
      nodes.push({
        id: step.stepId,
        type: step.kind === "for-each" ? "forEach" : "step",
        position: document.positions[step.stepId] ?? { x: 0, y: 0 },
        data: { stepId: step.stepId },
        selected: selectedId === step.stepId,
        ...(parentId ? { parentId, extent: "parent" as const } : {}),
        ...(size ? { style: { width: size.width, height: size.height } } : {}),
      });
      if (step.kind === "for-each") {
        visit(step.steps, step.stepId);
      }
    }
  };
  visit(document.steps);
  return nodes;
};

const toEdges = (document: EditorDocument): Edge[] =>
  document.wires.map((wire) => ({
    id: wire.id,
    source: wire.source,
    sourceHandle: wire.sourcePort,
    target: wire.target,
    targetHandle: "in",
    style: { stroke: "rgba(0, 0, 0, 0.2)", strokeWidth: 1.5 },
  }));

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
    // A step just added for the user (Look up in the graph) glows for a moment.
    "&[data-flash]": {
      borderColor: "blue.bd.strong",
      boxShadow: "[0 0 0 4px var(--colors-blue-bd-subtle)]",
    },
  },
  variants: {
    selected: {
      true: {
        // 1.5 px blue, drawn inside so the card keeps its size.
        borderColor: "blue.bd.strong",
        boxShadow: "[inset 0 0 0 0.5px var(--colors-blue-bd-strong)]",
        "& [data-port-add]": { opacity: "[1]" },
      },
    },
  },
});

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
  variants: {
    tone: {
      green: {
        backgroundColor: "green.bgSolid.surface.active",
        color: "green.fg.muted",
      },
      orange: {
        backgroundColor: "orange.bgSolid.surface.active",
        color: "orange.fg.muted",
      },
      blue: {
        backgroundColor: "blue.bgSolid.surface.active",
        color: "blue.fg.muted",
      },
      neutral: {
        backgroundColor: "blue.bgSolid.surface.active",
        color: "neutral.fg.muted",
      },
    },
  },
});

/** The V7 card's tile: a 14 px icon on a 24 px tile with a pale wash of the step's colour. */
const CardTile = ({
  icon,
  tone,
}: {
  icon: IconName;
  tone: "green" | "orange" | "neutral" | "blue";
}) => (
  <span className={cardTileStyle({ tone })}>
    <Icon name={icon} size="sm" />
  </span>
);

const cardHeadStyle = css({
  display: "flex",
  alignItems: "flex-start",
  gap: "2",
  padding: "3",
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
});

const portAddStyle = css({
  position: "absolute",
  right: "[-34px]",
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
  transform: "[translateY(-50%)]",
  zIndex: "[2]",
  _hover: { borderColor: "blue.bd.strong", color: "blue.fg.muted" },
  _focusVisible: {
    opacity: "[1]",
    outline: "[2px solid var(--colors-blue-bd-strong)]",
  },
});

/** E3: the + on a port, which opens the picker and wires the new step to this port. */
const PortAdd = ({
  stepId,
  port,
  top,
}: {
  stepId: string;
  port: string;
  top: string;
}) => {
  const { document, setUi } = useEditor();
  const dangling = !document.wires.some(
    (wire) => wire.source === stepId && wire.sourcePort === port,
  );
  return (
    <button
      type="button"
      aria-label="Add a step after this one"
      className={`${portAddStyle} nodrag nopan`}
      style={{ top }}
      data-port-add={`${stepId}:${port}`}
      data-dangling={dangling || undefined}
      onClick={(event) => {
        event.stopPropagation();
        setUi((ui) => ({
          ...ui,
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
  backgroundColor: "red.bg.solid",
  borderWidth: "[2px]",
  borderStyle: "solid",
  borderColor: "neutral.bgSolid.min",
});

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
const CardText = ({
  title,
  description,
}: {
  title: string;
  description?: string;
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
    <span className={oneLineStyle({ tone: "title" })}>{title}</span>
    <span className={oneLineStyle({ tone: description ? "body" : "muted" })}>
      {description ?? "Add a description…"}
    </span>
  </span>
);

const StepNodeView = ({ id, selected }: NodeProps<StepNode>) => {
  const { document, ui } = useEditor();
  const step = flatFind(document, id);
  if (!step || step.kind !== "action") {
    return null;
  }
  const entry = getCatalogEntry(step.actionDefinitionId);
  const ports = portRows(step);
  return (
    <div
      className={cardStyle({ selected })}
      data-flash={ui.flashId === id || undefined}
    >
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className={handleStyle}
        style={{ top: STEP_HEIGHT / 2 }}
      />
      <Tooltip content={entry?.title ?? step.actionDefinitionId} position="top">
        <div className={cardHeadStyle}>
          <CardTile
            icon={entry?.icon ?? "cube"}
            tone={entry?.tone ?? "green"}
          />
          <CardText
            title={entry?.title ?? step.actionDefinitionId}
            description={
              step.description && step.description !== entry?.title
                ? step.description
                : undefined
            }
          />
        </div>
      </Tooltip>
      {ports ? (
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
            >
              {port.label}
              <Handle
                id={port.outputName}
                type="source"
                position={Position.Right}
                className={handleStyle}
                style={{ top: PORT_ROW / 2 }}
              />
              <PortAdd
                stepId={id}
                port={port.outputName}
                top={`${PORT_ROW / 2}px`}
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          <Handle
            id="next"
            type="source"
            position={Position.Right}
            className={handleStyle}
            style={{ top: STEP_HEIGHT / 2 }}
          />
          <PortAdd stepId={id} port="next" top={`${STEP_HEIGHT / 2}px`} />
        </>
      )}
      <ProblemDot stepId={id} />
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
  "&[data-selected]": {
    borderColor: "blue.bd.strong",
    boxShadow: "[inset 0 0 0 0.5px var(--colors-blue-bd-strong)]",
  },
});

/** Start: always on the canvas, holds the flow's inputs and lists what starts the flow; steps follow it. */
const StartNodeView = ({ selected }: NodeProps<StepNode>) => {
  const { document } = useEditor();
  return (
    <div className={triggerStyle} data-selected={selected || undefined}>
      <Tooltip content="Start · holds the flow's inputs" position="top">
        <div className={cardHeadStyle}>
          <CardTile icon="play" tone="neutral" />
          <CardText title="Start" description={startSubtitle(document)} />
        </div>
      </Tooltip>
      <Handle
        id="next"
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{ top: STEP_HEIGHT / 2 }}
      />
      <PortAdd stepId={START_ID} port="next" top={`${STEP_HEIGHT / 2}px`} />
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
  },
  variants: {
    selected: {
      true: {
        borderColor: "blue.bd.strong",
        boxShadow: "[0 0 0 3px var(--colors-blue-bd-subtle)]",
      },
    },
  },
});

/** D17 D: a box names the group; the steps that run per item sit inside it (ledger, 20 Oct). */
const GroupNodeView = ({ id, selected }: NodeProps<StepNode>) => {
  const { document, setUi } = useEditor();
  const step = flatFind(document, id);
  if (!step || step.kind !== "for-each") {
    return null;
  }
  const over = step.over ? describeSource(document, step.over, id) : null;
  return (
    <div className={groupStyle({ selected })}>
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className={handleStyle}
        style={{ top: GROUP_HEADER / 2 }}
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
        <IconTile icon="rotate" tone="green" size="sm" />
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
      </div>
      {step.steps.length === 0 ? (
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
              width: "[24px]",
              height: "[24px]",
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
              setUi((ui) => ({
                ...ui,
                picker: { parentId: id, anchor: "group" },
              }));
            }}
          >
            <Icon name="plus" size="xs" />
          </button>
        </div>
      ) : null}
      <Handle
        id="next"
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{ top: GROUP_HEADER / 2 }}
      />
      <PortAdd stepId={id} port="next" top={`${GROUP_HEADER / 2}px`} />
      <ProblemDot stepId={id} />
    </div>
  );
};

const nodeTypes = {
  step: StepNodeView,
  start: StartNodeView,
  forEach: GroupNodeView,
};

/**
 * No browser focus ring on the canvas itself (a mouse click can focus the pane, and Edge draws its own ring there),
 * and React Flow's selection box in DS blue rather than its default violet. Keyboard focus on a node keeps the DS ring.
 */
const canvasStyle = css({
  "&, & .react-flow__renderer, & .react-flow__pane, & .react-flow__viewport": {
    outline: "none",
  },
  "& .react-flow__node:focus:not(:focus-visible), & .react-flow__edge:focus:not(:focus-visible)":
    { outline: "none" },
  "& .react-flow__node:focus-visible": {
    outline: "[2px solid var(--colors-blue-bd-strong)]",
    outlineOffset: "[2px]",
    borderRadius: "lg",
  },
  "& .react-flow__selection, & .react-flow__nodesselection-rect": {
    backgroundColor: "blue.bg.surface",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "blue.bd.solid",
  },
});

/** Leaves room for the bottom bar, and keeps text readable on a big flow. The panel is docked beside the canvas. */
const fitOptions = {
  padding: { top: "48px", left: "48px", bottom: "96px", right: "48px" },
  maxZoom: 1,
  minZoom: 0.6,
} as const;

export const FlowCanvas = ({
  onInit,
  mode = "select",
}: {
  onInit: (fitView: () => void, zoom: (by: number) => void) => void;
  /** Hand pans on drag; Select drags a selection box (and pans with the middle or right button). */
  mode?: "select" | "hand";
}) => {
  const { document, setDocument, ui, setUi } = useEditor();
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const flow = useReactFlow<StepNode>();
  // On first load, wait for the initial fit to finish before panning to the selection.
  const loaded = useRef(false);

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

  // Keep the selected step (or one just added) in view; the panel is docked beside the canvas.
  const focusId = ui.flashId ?? ui.selectedId;
  useEffect(() => {
    const delay = loaded.current ? 150 : 600;
    loaded.current = true;
    if (!focusId) {
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

  const nodes = toNodes(
    { ...document, positions: { ...document.positions, ...dragPositions } },
    ui.selectedId,
  );

  const onNodesChange = (changes: NodeChange<StepNode>[]) => {
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

  return (
    <ReactFlow
      className={canvasStyle}
      nodes={nodes}
      edges={toEdges(document)}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeDragStop={onNodeDragStop}
      onConnect={onConnect}
      onNodeClick={(_, node) =>
        setUi((current) => ({
          ...current,
          selectedId: node.id,
          triggerId: null,
          openField: null,
        }))
      }
      onPaneClick={() =>
        setUi((current) => ({
          ...current,
          selectedId: null,
          picker: null,
          openField: null,
        }))
      }
      onNodesDelete={(deleted) =>
        setDocument((current) =>
          deleted.reduce((next, node) => removeStep(next, node.id), current),
        )
      }
      onEdgesDelete={(deleted) =>
        setDocument((current) => ({
          ...current,
          wires: current.wires.filter(
            (wire) => !deleted.some((edge) => edge.id === wire.id),
          ),
        }))
      }
      onInit={(instance) =>
        onInit(
          () => {
            instance.fitView(fitOptions).catch(() => undefined);
          },
          (by) => {
            instance.zoomTo(instance.getZoom() * by).catch(() => undefined);
          },
        )
      }
      fitView
      fitViewOptions={fitOptions}
      panOnDrag={mode === "hand" ? true : [1, 2]}
      selectionOnDrag={mode === "select"}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      deleteKeyCode={["Backspace", "Delete"]}
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
        nodeColor="var(--colors-neutral-fg-onSolid)"
        nodeStrokeColor="var(--colors-neutral-bd-solid)"
      />
    </ReactFlow>
  );
};

export { stepTitle };

const thumbnailStyle = css({
  width: "[100%]",
  height: "[100%]",
  pointerEvents: "none",
  "& .react-flow__handle, & [data-port-add], & [data-group-add]": {
    display: "none",
  },
});

/**
 * A static preview of a flow for the flows list: fitted to its card, with every interaction off and no pointer
 * events inside. Clicking the card (not the canvas) opens the flow.
 */
export const FlowThumbnail = () => {
  const { document } = useEditor();
  return (
    <div className={thumbnailStyle} aria-hidden="true">
      <ReactFlow
        nodes={toNodes(document, null)}
        edges={toEdges(document)}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 0.8 }}
        minZoom={0.05}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
};
