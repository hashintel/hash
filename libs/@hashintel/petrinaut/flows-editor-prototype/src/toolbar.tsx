import { useReactFlow, useViewport } from "@xyflow/react";
import { useEffect } from "react";

import { Button, Icon, Menu } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { START_ID, type EditorDocument } from "./document";

/** "Flows toolbar · Attio layout": 4 px in, 4 px gaps, a hairline, 8 px corners and a soft drop shadow. */
const barStyle = css({
  position: "absolute",
  bottom: "[18px]",
  left: "[50%]",
  transform: "[translateX(-50%)]",
  display: "flex",
  alignItems: "center",
  gap: "1",
  padding: "1",
  backgroundColor: "neutral.bgSolid.min",
  borderWidth: "thin",
  borderColor: "neutral.bd.solid",
  borderStyle: "solid",
  borderRadius: "lg",
  boxShadow: "[0 4px 3px rgba(0, 0, 0, 0.1), 0 2px 2px rgba(0, 0, 0, 0.1)]",
  zIndex: "[4]",
});

const dividerStyle = css({
  width: "[1px]",
  height: "[20px]",
  backgroundColor: "neutral.bd.solid",
});

/** DS icon buttons at the toolbar's 32 px square, icons in #646464 unless active. */
const toolStyle = css({
  "&[class]": {
    width: "[32px]",
    height: "[32px]",
    minWidth: "[32px]",
    padding: "[0]",
    justifyContent: "center",
  },
  "&[class]:not([data-variant=solid])": { color: "neutral.fg.muted" },
});

/** The zoom button's text: 14 px medium #646464 between two 14 px icons. */
const zoomStyle = css({
  "&[class]": {
    color: "neutral.fg.muted",
    fontWeight: "medium",
    // The DS button puts zero-width text around its icons; gaps would count them, so space the label instead.
    gap: "0",
    paddingX: "2",
    minWidth: "[0]",
  },
  "&[class] > *": { paddingX: "[0]", marginX: "[0]" },
  "&[class] > span:not(:has(svg))": { paddingX: "0.5", marginX: "1" },
  "&[class] svg": {
    width: "[14px]",
    height: "[14px]",
    minWidth: "[14px]",
    "--icon-size": "14px",
  },
});

const columnGap = 296;
const rowGap = 130;

/**
 * Organize: lays the flow out left to right. Start first, then each top-level step one column after the furthest
 * step before it. Steps inside a for-each keep their places in the group.
 */
export const organize = (document: EditorDocument): EditorDocument => {
  const column = new Map<string, number>([[START_ID, 0]]);
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
  for (const id of [START_ID, ...topLevel]) {
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
            className={zoomStyle}
            prefix={<Icon name="search" size="sm" />}
            suffix={<Icon name="chevronDown" size="sm" />}
          >
            {`${Math.round(zoom * 100)}%`}
          </Button>
        }
      />
      <Button
        size="sm"
        className={toolStyle}
        variant={mode === "hand" ? "solid" : "ghost"}
        tone={mode === "hand" ? "brand" : "neutral"}
        iconName="hand"
        aria-label="Hand"
        tooltip="Hand (H)"
        pressed={mode === "hand"}
        onClick={() => onMode("hand")}
      />
      <Button
        size="sm"
        className={toolStyle}
        variant={mode === "select" ? "solid" : "ghost"}
        tone={mode === "select" ? "brand" : "neutral"}
        iconName="cursor"
        aria-label="Select"
        tooltip="Select (V)"
        pressed={mode === "select"}
        onClick={() => onMode("select")}
      />
      <span className={dividerStyle} />
      {/* Icon only, like Hand and Select (Aakarsh, 21 Oct). N still opens the picker, which anchors above it. */}
      <Button
        ref={addNodeRef}
        size="sm"
        className={toolStyle}
        variant="ghost"
        iconName="plus"
        aria-label="Add node"
        tooltip="Add node (N)"
        pressed={pickerOpen}
        onClick={onAddNode}
      />
      <Button
        size="sm"
        className={toolStyle}
        variant="ghost"
        iconName="list"
        aria-label="Organize"
        tooltip="Organize"
        onClick={onOrganize}
      />
    </div>
  );
};
