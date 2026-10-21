import "@xyflow/react/dist/style.css";
import {
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
  isTriggerId,
  removeStep,
  removeTrigger,
  stepTitle,
} from "./document";
import { useEditor } from "./editor-context";
import { triggerDefinitions } from "./mock-triggers";
import { describeSource } from "./shapes";
import { IconTile } from "./ui";

// The V7 card on ↳ Current: 200 wide, 12 px in, a 24 px tile and two lines (59 px with its border).
export const STEP_WIDTH = 200;
const STEP_HEIGHT = 59;
const PORT_ROW = 26;
const GROUP_HEADER = 48;
const GROUP_PADDING = 32;

type StepData = { stepId: string };
type StepNode = Node<StepData, "step" | "forEach" | "trigger" | "start">;

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
    return { width: 420, height: 180 };
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
    width: Math.max(420, right + GROUP_PADDING + 24),
    height: Math.max(180, bottom + GROUP_PADDING),
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
    ...document.triggers.map((trigger, index) => ({
      id: trigger.id,
      type: "trigger" as const,
      position: document.positions[trigger.id] ?? {
        x: 40,
        y: 220 + index * 130,
      },
      data: { stepId: trigger.id },
      selected: selectedId === trigger.id,
    })),
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
    backgroundColor: "neutral.s00",
    borderWidth: "thin",
    borderStyle: "solid",
    borderColor: "neutral.s45",
    borderRadius: "lg",
    transition: "[border-color 0.15s ease]",
    "&:hover [data-port-add]": { opacity: "[1]" },
  },
  variants: {
    selected: {
      true: {
        // 1.5 px blue, drawn inside so the card keeps its size.
        borderColor: "blue.s80",
        boxShadow: "[inset 0 0 0 0.5px var(--colors-blue-s80)]",
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
    "& svg": { width: "[14px]", height: "[14px]" },
  },
  variants: {
    tone: {
      green: { backgroundColor: "green.s20", color: "green.s100" },
      orange: { backgroundColor: "orange.s20", color: "orange.s100" },
      blue: { backgroundColor: "blue.s20", color: "blue.s100" },
      neutral: { backgroundColor: "blue.s20", color: "neutral.s100" },
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
    backgroundColor: "neutral.s00",
    borderWidth: "thin",
    borderColor: "neutral.s90",
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
  backgroundColor: "neutral.s00",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.s50",
  color: "neutral.s100",
  cursor: "pointer",
  opacity: "[0]",
  transition: "[opacity 0.15s ease]",
  transform: "[translateY(-50%)]",
  zIndex: "[2]",
  _hover: { borderColor: "blue.s90", color: "blue.s100" },
  _focusVisible: {
    opacity: "[1]",
    outline: "[2px solid var(--colors-blue-s90)]",
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
  backgroundColor: "red.s90",
  borderWidth: "[2px]",
  borderStyle: "solid",
  borderColor: "neutral.s00",
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
  if (problems.length === 0) {
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
      title: {
        fontSize: "[13px]",
        lineHeight: "[16px]",
        fontWeight: "medium",
        color: "neutral.s120",
      },
      body: { fontSize: "xs", lineHeight: "[15px]", color: "neutral.s90" },
      muted: { fontSize: "xs", lineHeight: "[15px]", color: "neutral.s80" },
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
      gap: "0.5",
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
  const { document } = useEditor();
  const step = flatFind(document, id);
  if (!step || step.kind !== "action") {
    return null;
  }
  const entry = getCatalogEntry(step.actionDefinitionId);
  const ports = portRows(step);
  return (
    <div className={cardStyle({ selected })}>
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
            borderTopColor: "neutral.s40",
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
                fontSize: "xs",
                color: "neutral.s90",
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
  backgroundColor: "neutral.s00",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.s45",
  borderRadius: "lg",
  position: "relative",
  "&:hover [data-port-add]": { opacity: "[1]" },
  "&[data-selected] [data-port-add]": { opacity: "[1]" },
  "&[data-selected]": {
    borderColor: "blue.s80",
    boxShadow: "[inset 0 0 0 0.5px var(--colors-blue-s80)]",
  },
});

/** Triggers sit on the canvas and lead into the first actions (Dora and Aakarsh, 21 Oct). */
const TriggerNodeView = ({ id, selected }: NodeProps<StepNode>) => {
  const { document } = useEditor();
  const trigger = document.triggers.find((candidate) => candidate.id === id);
  if (!trigger) {
    return null;
  }
  const definition = triggerDefinitions[trigger.kind];
  return (
    <div className={triggerStyle} data-selected={selected || undefined}>
      <Tooltip content={`Trigger · ${definition.title}`} position="top">
        <div className={cardHeadStyle}>
          <CardTile icon={definition.icon} tone="blue" />
          <CardText
            title={definition.title}
            description={trigger.description || undefined}
          />
        </div>
      </Tooltip>
      <Handle
        id="next"
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{ top: STEP_HEIGHT / 2 }}
      />
    </div>
  );
};

/** Start: always on the canvas, holds the flow's inputs; triggers lead into it, steps follow it. */
const StartNodeView = ({ selected }: NodeProps<StepNode>) => {
  const { document } = useEditor();
  return (
    <div className={triggerStyle} data-selected={selected || undefined}>
      <Handle
        id="in"
        type="target"
        position={Position.Left}
        className={handleStyle}
        // Start's left port only shows once a trigger leads into it (J3 draws Start without one).
        style={{
          top: STEP_HEIGHT / 2,
          opacity: document.triggers.length > 0 ? 1 : 0,
        }}
      />
      <Tooltip content="Start · holds the flow's inputs" position="top">
        <div className={cardHeadStyle}>
          <CardTile icon="play" tone="neutral" />
          <CardText
            title="Start"
            description={document.startDescription || undefined}
          />
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
    borderColor: "neutral.s50",
    borderRadius: "xl",
    backgroundColor: "[rgba(250, 250, 250, 0.7)]",
    position: "relative",
  },
  variants: {
    selected: {
      true: {
        borderColor: "blue.s90",
        boxShadow: "[0 0 0 3px var(--colors-blue-a30)]",
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
              fontSize: "[13px]",
              lineHeight: "[16px]",
              fontWeight: "medium",
              color: "neutral.s120",
            })}
          >
            {step.description || "For each"}
          </span>
        </Tooltip>
        <button
          type="button"
          data-group-add={id}
          className={`${css({
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: "1",
            fontSize: "xs",
            color: "neutral.s100",
            borderRadius: "md",
            paddingX: "2",
            height: "[24px]",
            cursor: "pointer",
            _hover: { backgroundColor: "neutral.s20" },
          })} nodrag nopan`}
          onClick={(event) => {
            event.stopPropagation();
            setUi((ui) => ({
              ...ui,
              picker: { parentId: id, anchor: "group" },
            }));
          }}
        >
          <Icon name="plus" size="xxs" />
          Add step inside
        </button>
      </div>
      {step.steps.length === 0 ? (
        <div
          className={css({
            position: "absolute",
            inset: "[48px 0 0 0]",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "xs",
            color: "neutral.s90",
          })}
        >
          Steps here run once per item.
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
  trigger: TriggerNodeView,
  start: StartNodeView,
  forEach: GroupNodeView,
};

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

  // Keep the selected step in view (the panel is docked beside the canvas, so the whole pane is visible).
  useEffect(() => {
    const delay = loaded.current ? 150 : 600;
    loaded.current = true;
    if (!ui.selectedId) {
      return;
    }
    const timer = setTimeout(() => {
      const node = flow.getInternalNode(ui.selectedId!);
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
  }, [ui.selectedId, flow]);

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
          deleted.reduce(
            (next, node) =>
              isTriggerId(next, node.id)
                ? removeTrigger(next, node.id)
                : removeStep(next, node.id),
            current,
          ),
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
    />
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
