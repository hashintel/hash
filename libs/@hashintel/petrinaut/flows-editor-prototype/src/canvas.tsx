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
  useReactFlow,
} from "@xyflow/react";
import { useEffect, useRef, useState } from "react";

import {
  Icon,
  type IconName,
  type ItemOrGroup,
  type MenuItem,
  RightClickMenu,
  Tooltip,
} from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";

import { getCatalogEntry } from "./catalog";
import {
  START_ID,
  type DraftStep,
  type EditorDocument,
  removeStep,
  startSubtitle,
  stepTitle,
} from "./document";
import {
  type CanvasMenu,
  showDebug,
  showFull,
  useEditor,
} from "./editor-context";
import { useRunView } from "./history-view";
import { mockRuns, stepRunStatus } from "./mock-runs";
import { RunBar, RunGlyph } from "./run-glyph";
import { type StepRun, runTriggerId, triggerLabel } from "./run-history";
import { describeSource } from "./shapes";

// The V7 card on ↳ Current: 200 wide, 12 px in, a 24 px tile and two lines (59 px with its border).
export const STEP_WIDTH = 200;
const STEP_HEIGHT = 59;
const PORT_ROW = 26;
const GROUP_HEADER = 48;
const GROUP_PADDING = 32;

type StepData = { stepId: string };
type StepNode = Node<StepData, "step" | "forEach" | "start" | "trigger">;

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

/** J1.13: a folded For each is its header alone, 240 wide, a step card's height. */
const FOLDED_GROUP = { width: 240, height: 58 };

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
    }
  };
  visit(document.steps);
  return nodes;
};

const toEdges = (
  document: EditorDocument,
  collapsed: string[] = [],
): Edge[] => {
  const hidden = hiddenSteps(document, collapsed);
  return document.wires
    .filter((wire) => !hidden.has(wire.source) && !hidden.has(wire.target))
    .map((wire) => ({
      id: wire.id,
      source: wire.source,
      sourceHandle: wire.sourcePort,
      target: wire.target,
      targetHandle: "in",
      type: "flow",
      style: { stroke: "rgba(0, 0, 0, 0.2)", strokeWidth: 1.5 },
    }));
};

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
    // A reference to this step is hovered in the panel: the soft ring a new step glows with, and the +, as on hover.
    "&[data-source-hover]": {
      boxShadow: "[0 0 0 3px var(--colors-blue-bd-subtle)]",
    },
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
  // J1.21: the port whose menu is open shows blue.
  "&.react-flow__handle[data-highlight]": {
    backgroundColor: "blue.bg.solid",
    borderColor: "blue.bd.strong",
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
          event.preventDefault();
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
  _hover: { borderColor: "blue.bd.strong", color: "blue.fg.muted" },
  _focusVisible: {
    opacity: "[1]",
    outline: "[2px solid var(--colors-blue-bd-strong)]",
  },
});

/** E3: the + on a port, which opens the picker and wires the new step to this port. */
const PortAdd = ({ stepId, port }: { stepId: string; port: string }) => {
  const { document, ui, setUi } = useEditor();
  // A run is read-only: no + on its ports.
  if (useRunView()) {
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
  backgroundColor: "red.bg.solid",
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
  "&[data-status=done]": { backgroundColor: "green.bg.solid" },
  "&[data-status=failed]": { backgroundColor: "red.bg.solid" },
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
 * Run marks B (4 Nov): a step that runs once shows its state glyph at the card's top-right; a step inside a For each
 * shows the segmented bar along its bottom edge. Sizes are in canvas units: about 12 px and 4 px at J6's 45%.
 */
const RunMark = ({ mark, inset = 8 }: { mark?: StepRun; inset?: number }) =>
  !mark ? null : mark.bar ? (
    <RunBar segments={mark.bar} height={8} gap={3} />
  ) : (
    <span
      className={css({ position: "absolute", pointerEvents: "none" })}
      style={{ top: inset, right: inset }}
    >
      <RunGlyph state={mark.state} size={22} />
    </span>
  );

/** In a run: steps not reached or skipped at 50%, the running step with a blue border, a waiting one orange. */
const runStateStyle = css({
  "&[data-run-state=notReached], &[data-run-state=skipped]": {
    opacity: "[0.5]",
  },
  "&[data-run-state=running]": { borderColor: "blue.bd.solid" },
  "&[data-run-state=needsReview]": {
    borderColor: "orange.bd.strong",
    boxShadow: "[inset 0 0 0 0.5px var(--colors-orange-bd-strong)]",
  },
});

/** A For each box in a run only fades when not reached; its border stays grey while it runs. */
const runFadeStyle = css({
  "&[data-run-state=notReached]": { opacity: "[0.5]" },
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
  const runView = useRunView();
  const step = flatFind(document, id);
  if (!step || step.kind !== "action") {
    return null;
  }
  const entry = getCatalogEntry(step.actionDefinitionId);
  // A run draws every step as the one-line card: its branches are not ports to wire from.
  const ports = runView ? null : portRows(step);
  const mark = runView?.steps?.[id];
  return (
    <div
      className={cx(cardStyle({ selected }), runStateStyle)}
      data-run-state={mark?.state}
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
              <PortHandle
                stepId={id}
                id={port.outputName}
                type="source"
                position={Position.Right}
                className={handleStyle}
                style={{ top: PORT_ROW / 2 }}
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
    boxShadow: "[0 0 0 3px var(--colors-blue-bd-subtle)]",
  },
  "&[data-selected]": {
    borderColor: "blue.bd.strong",
    boxShadow: "[inset 0 0 0 0.5px var(--colors-blue-bd-strong)]",
  },
});

/** Start: always on the canvas, holds the flow's inputs and lists what starts the flow; steps follow it. */
const StartNodeView = ({ selected }: NodeProps<StepNode>) => {
  const { document, ui } = useEditor();
  const runView = useRunView();
  return (
    <div
      className={triggerStyle}
      data-selected={selected || undefined}
      data-source-hover={ui.hoverSourceId === START_ID || undefined}
    >
      {runView ? (
        // In a run, the trigger that fired leads into Start.
        <Handle
          id="in"
          type="target"
          position={Position.Left}
          className={handleStyle}
          style={{ top: STEP_HEIGHT / 2 }}
          isConnectable={false}
        />
      ) : null}
      <Tooltip content="Start · holds the flow's inputs" position="top">
        <div className={cardHeadStyle}>
          <CardTile icon="play" tone="neutral" />
          <CardText title="Start" description={startSubtitle(document)} />
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

/** J6: in a run, only the trigger that fired shows, highlighted, left of Start. */
const RunTriggerView = ({ selected }: NodeProps<StepNode>) => {
  const runView = useRunView();
  if (!runView?.run) {
    return null;
  }
  const label = triggerLabel(runView.run);
  return (
    <div
      className={cx(
        triggerStyle,
        css({
          borderColor: "blue.bd.solid",
          "&[data-selected]": { borderColor: "blue.bd.strong" },
        }),
      )}
      data-selected={selected || undefined}
    >
      <div className={cardHeadStyle}>
        <CardTile
          icon={
            runView.run.trigger.kind === "manual" ? "user" : "calendarClock"
          }
          tone="neutral"
        />
        <CardText title={label.title} description={label.line} />
      </div>
      <Handle
        id="next"
        type="source"
        position={Position.Right}
        className={handleStyle}
        style={{ top: STEP_HEIGHT / 2 }}
        isConnectable={false}
      />
      <RunMark mark={runView.steps?.[runTriggerId]} />
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
      boxShadow: "[0 0 0 3px var(--colors-blue-bd-subtle)]",
    },
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
  const { document, ui, setUi } = useEditor();
  const runView = useRunView();
  const step = flatFind(document, id);
  if (!step || step.kind !== "for-each") {
    return null;
  }
  const over = step.over ? describeSource(document, step.over, id) : null;
  const folded = ui.collapsed?.includes(id) ?? false;
  const mark = runView?.steps?.[id];
  return (
    <div
      className={cx(groupStyle({ selected }), runFadeStyle)}
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
      <RunMark mark={mark} inset={14} />
    </div>
  );
};

const nodeTypes = {
  step: StepNodeView,
  start: StartNodeView,
  forEach: GroupNodeView,
  trigger: RunTriggerView,
};

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
  borderColor: "blue.bd.strong",
  color: "blue.fg.muted",
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
            ? { ...style, stroke: "var(--colors-blue-bd-strong)" }
            : style
        }
      />
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

const edgeTypes = { flow: FlowEdge };

/** Wires touching any of these steps. */
const touching =
  (ids: string[]) => (wire: { source: string; target: string }) =>
    ids.includes(wire.source) || ids.includes(wire.target);

/**
 * The canvas's right-click menus. J1.16 a step: Disconnect from previous, Disconnect all, then Delete step (⌫), as
 * Backspace does (3 Nov). A box selection: Disconnect all. J1.20 a connection: Disconnect, Insert step here. J1.21 a
 * port: Disconnect, Disconnect all. Connections and ports have no Delete (2 Nov).
 */
const useCanvasMenuItems = (
  menu: CanvasMenu | null | undefined,
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
    // Never shown: a right-click on empty canvas stops before the menu (see `onPaneContextMenu`).
    return [
      {
        id: "none",
        text: "Nothing to do here",
        disabled: true,
        onClick: () => undefined,
      },
    ];
  }
  return (() => {
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
              suffix: "⌫",
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
  const runView = useRunView();
  const readOnly = Boolean(runView);
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  const flow = useReactFlow<StepNode>();
  // The mouse-up that ends a wire on empty canvas is also a click on the pane; it must not close the menu it opens.
  const droppedAt = useRef(0);
  // On first load, wait for the initial fit to finish before panning to the selection.
  const loaded = useRef(false);
  // A screen opened at a set viewport (a Figma frame) stays where it opened; it does not pan to its selection.
  const placed = useRef(!!ui.viewport);

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
    return ui.viewport
      ? {
          x: ui.viewport.left - start.x * ui.viewport.zoom,
          y: ui.viewport.top - start.y * ui.viewport.zoom,
          zoom: ui.viewport.zoom,
        }
      : undefined;
  });

  const canvasMenuItems = useCanvasMenuItems(ui.canvasMenu);
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

  const stepNodes = toNodes(
    { ...document, positions: { ...document.positions, ...dragPositions } },
    ui.selectedId,
    ui.collapsed,
    ui.selectedIds,
  );
  const start = document.positions[START_ID] ?? { x: 360, y: 220 };
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
    : stepNodes;
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
            style: { stroke: "rgba(0, 0, 0, 0.2)", strokeWidth: 1.5 },
          },
        ]
      : []),
    ...toEdges(document, ui.collapsed),
  ];

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

  return (
    // One DS right-click menu for the canvas; what was right-clicked (set by the handlers below) decides its rows.
    <RightClickMenu
      items={canvasMenuItems}
      className={css({ minWidth: "[268px]" })}
    >
      <ReactFlow
        className={canvasStyle}
        nodes={nodes}
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
          if (readOnly) {
            event.preventDefault();
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
          if (readOnly) {
            event.preventDefault();
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
          // Empty canvas has no menu: keep the right-click from reaching it, and keep the browser's own away.
          event.preventDefault();
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
        data-quiet-port-add={(ui.quietPortAdd && !showFull) || undefined}
        // A click on a port is the + on it (J0.5), not the start of a click-to-connect.
        connectOnClick={false}
        fitView={!startViewport}
        fitViewOptions={fitOptions}
        defaultViewport={startViewport}
        panOnDrag={mode === "hand" ? true : [1, 2]}
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
          nodeColor="var(--colors-neutral-fg-onSolid)"
          nodeStrokeColor="var(--colors-neutral-bd-solid)"
        />
      </ReactFlow>
    </RightClickMenu>
  );
};

export { stepTitle };
