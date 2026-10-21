import { useReactFlow, useViewport } from "@xyflow/react";
import { useEffect } from "react";

import { Button, Icon, Menu, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { START_ID, type EditorDocument } from "./document";

const barStyle = css({
  position: "absolute",
  bottom: "[24px]",
  left: "[50%]",
  transform: "[translateX(-50%)]",
  display: "flex",
  alignItems: "center",
  gap: "1",
  padding: "1",
  backgroundColor: "neutral.s00",
  borderWidth: "thin",
  borderColor: "neutral.s40",
  borderStyle: "solid",
  borderRadius: "lg",
  boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.1)]",
  zIndex: "[4]",
});

const dividerStyle = css({
  width: "[1px]",
  height: "[20px]",
  backgroundColor: "neutral.s30",
  marginX: "1",
});

const keyHintStyle = css({
  fontSize: "[11px]",
  lineHeight: "[16px]",
  paddingX: "1",
  borderWidth: "thin",
  borderStyle: "solid",
  borderColor: "neutral.s40",
  borderRadius: "sm",
  color: "neutral.s90",
  marginLeft: "1",
});

const columnGap = 320;
const rowGap = 130;

/**
 * Organize: lays the flow out left to right. Triggers in the first column, Start next, then each top-level step one
 * column after the furthest step before it. Steps inside a for-each keep their places in the group.
 */
export const organize = (document: EditorDocument): EditorDocument => {
  const column = new Map<string, number>(
    document.triggers.map((trigger) => [trigger.id, 0]),
  );
  column.set(START_ID, document.triggers.length > 0 ? 1 : 0);
  const topLevel = new Set(document.steps.map((step) => step.stepId));
  for (let pass = 0; pass < topLevel.size + 2; pass += 1) {
    for (const wire of document.wires) {
      const from = column.get(wire.source);
      if (from !== undefined && topLevel.has(wire.target)) {
        column.set(
          wire.target,
          Math.max(column.get(wire.target) ?? 0, from + 1),
        );
      }
    }
  }
  let unplaced = Math.max(0, ...column.values()) + 1;
  for (const step of document.steps) {
    if (!column.has(step.stepId)) {
      column.set(step.stepId, unplaced);
      unplaced += 1;
    }
  }
  const rows = new Map<number, number>();
  const positions = { ...document.positions };
  for (const id of [
    ...document.triggers.map((trigger) => trigger.id),
    START_ID,
    ...topLevel,
  ]) {
    const col = column.get(id) ?? 0;
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    positions[id] = { x: 40 + col * columnGap, y: 120 + row * rowGap };
  }
  return { ...document, positions };
};

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/**
 * The bottom bar, as Attio's workflow editor has it: zoom menu, Hand (H), Select (V), a labelled Add node (N), and
 * Organize. No AI button: manual journeys only for now.
 */
export const FlowToolbar = ({
  mode,
  onMode,
  addNodeRef,
  pickerOpen,
  onAddNode,
  onOrganize,
}: {
  mode: "select" | "hand";
  onMode: (mode: "select" | "hand") => void;
  addNodeRef: React.RefObject<HTMLButtonElement | null>;
  pickerOpen: boolean;
  onAddNode: () => void;
  onOrganize: () => void;
}) => {
  const flow = useReactFlow();
  const { zoom } = useViewport();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        isTyping(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "h") {
        onMode("hand");
      } else if (key === "v") {
        onMode("select");
      } else if (key === "n") {
        event.preventDefault();
        onAddNode();
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [onMode, onAddNode]);

  return (
    <div className={barStyle} role="toolbar" aria-label="Canvas tools">
      <Menu
        position="top-start"
        items={[
          {
            id: "in",
            text: "Zoom in",
            onClick: () => {
              flow.zoomIn().catch(() => undefined);
            },
          },
          {
            id: "out",
            text: "Zoom out",
            onClick: () => {
              flow.zoomOut().catch(() => undefined);
            },
          },
          {
            id: "reset",
            text: "Reset to 100%",
            onClick: () => {
              flow.zoomTo(1).catch(() => undefined);
            },
          },
          {
            id: "fit",
            text: "Zoom to fit",
            onClick: () => {
              flow.fitView({ padding: 0.2, maxZoom: 1 }).catch(() => undefined);
            },
          },
        ]}
        trigger={
          <Button
            size="sm"
            variant="ghost"
            aria-label="Zoom"
            prefix={<Icon name="search" size="sm" />}
            suffix={<Icon name="chevronDown" size="xs" />}
          >
            {`${Math.round(zoom * 100)}%`}
          </Button>
        }
      />
      <Button
        size="sm"
        variant="ghost"
        iconName="hand"
        aria-label="Hand"
        tooltip="Hand (H)"
        pressed={mode === "hand"}
        onClick={() => onMode("hand")}
      />
      <Button
        size="sm"
        variant="ghost"
        iconName="cursor"
        aria-label="Select"
        tooltip="Select (V)"
        pressed={mode === "select"}
        onClick={() => onMode("select")}
      />
      <span className={dividerStyle} />
      <Tooltip content="Add triggers and steps">
        <Button
          ref={addNodeRef}
          size="sm"
          variant="ghost"
          aria-label="Add node"
          pressed={pickerOpen}
          prefix={<Icon name="plus" size="sm" />}
          suffix={<kbd className={keyHintStyle}>N</kbd>}
          onClick={onAddNode}
        >
          Add node
        </Button>
      </Tooltip>
      <Button
        size="sm"
        variant="ghost"
        iconName="diagramNested"
        aria-label="Organize"
        tooltip="Organize"
        onClick={onOrganize}
      />
    </div>
  );
};
