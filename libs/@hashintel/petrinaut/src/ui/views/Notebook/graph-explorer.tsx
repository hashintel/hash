import { useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { ResizeHandle } from "../../resize/resize-handle";
import { useFocusGrid } from "../../worksheet/use-focus-grid";
import { CELL_KIND_ICONS, CELL_KIND_LABELS } from "./cell-kinds";
import { NetGraphView } from "./net-graph";

import type { FocusGrid } from "../../worksheet/use-focus-grid";
import type { CellConnections, NetGraph, NodeRef } from "./notebook-model";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  height: "full",
  minHeight: "[0]",
});

const headerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  paddingX: "3",
  paddingTop: "3",
  paddingBottom: "2",
});

const headerActionsStyle = css({
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  gap: "1",
});

/** The graph takes every pixel the lists below don't claim. */
const graphPaneStyle = css({
  flex: "[1]",
  minHeight: "[160px]",
  display: "flex",
  paddingX: "3",
  paddingBottom: "3",
});

const listsPaneStyle = css({
  position: "relative",
  flexShrink: 0,
  display: "flex",
  flexDirection: "column",
  gap: "3",
  paddingX: "3",
  paddingTop: "3",
  paddingBottom: "3",
  overflowY: "auto",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.s30",
});

const titleStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "wide",
  color: "neutral.fg.subtle",
});

const selectedNameStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s115",
  overflowWrap: "anywhere",
});

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
});

/** Section titles are tinted to match the edge colours in the diagram. */
const sectionTitleStyle = cva({
  base: {
    fontSize: "xs",
    fontWeight: "semibold",
  },
  variants: {
    direction: {
      upstream: { color: "blue.s100" },
      downstream: { color: "orange.s100" },
    },
  },
});

const nodeRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  minHeight: "7",
  paddingX: "1.5",
  borderRadius: "lg",
  fontSize: "sm",
  color: "neutral.s115",
  cursor: "pointer",
  textAlign: "left",
  backgroundColor: "[transparent]",
  borderWidth: "[0]",
  width: "full",
  _hover: {
    backgroundColor: "neutral.bg.surface.hover",
  },
});

const nodeKindStyle = css({
  flexShrink: 0,
  fontSize: "xs",
  fontFamily: "mono",
  color: "purple.s100",
});

const nodeNameStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

const iconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "neutral.s80",
});

const hintStyle = css({
  fontSize: "xs",
  color: "neutral.fg.subtle",
  lineHeight: "[1.5]",
});

const NODE_ICON_SIZE = 10;

const DEFAULT_LISTS_HEIGHT = 220;
const MIN_LISTS_HEIGHT = 90;
const MAX_LISTS_HEIGHT = 640;

const NodeRow: React.FC<{
  node: NodeRef;
  onNavigate: (node: NodeRef) => void;
  /** The lists' single-column grid in the worksheet focus flow. */
  grid: FocusGrid;
  /** The row's position in that grid, across both sections. */
  index: number;
}> = ({ node, onNavigate, grid, index }) => {
  const KindIcon = CELL_KIND_ICONS[node.type];

  return (
    <button
      type="button"
      ref={grid.register(index, 0)}
      tabIndex={grid.tabIndexFor(index, 0)}
      className={nodeRowStyle}
      onClick={() => onNavigate(node)}
      onKeyDown={grid.onKeyDown(index, 0)}
      onFocus={() => grid.onFocusCell(index, 0)}
    >
      <span className={iconStyle}>
        <KindIcon size={NODE_ICON_SIZE} />
      </span>
      <span className={nodeKindStyle}>{CELL_KIND_LABELS[node.type]}</span>
      <span className={nodeNameStyle}>{node.name}</span>
    </button>
  );
};

const NodeSection: React.FC<{
  title: string;
  direction: "upstream" | "downstream";
  nodes: NodeRef[];
  onNavigate: (node: NodeRef) => void;
  grid: FocusGrid;
  /** Grid position of this section's first row. */
  baseIndex: number;
}> = ({ title, direction, nodes, onNavigate, grid, baseIndex }) => (
  <div className={sectionStyle}>
    <span className={sectionTitleStyle({ direction })}>{title}</span>
    {nodes.length > 0 ? (
      nodes.map((node, offset) => (
        <NodeRow
          key={`${node.type}-${node.id}`}
          node={node}
          onNavigate={onNavigate}
          grid={grid}
          index={baseIndex + offset}
        />
      ))
    ) : (
      <span className={hintStyle}>None</span>
    )}
  </div>
);

const contentsStyle = css({ display: "contents" });

/**
 * The two connection lists as one single-column member of the worksheet
 * focus flow: vertical arrows walk every row across both sections, the pair
 * is one roving tab stop, and a horizontal move at the edge crosses back
 * into the cell list. Remounted per selection (via `key`) so the roving
 * memory never points at a row the new selection doesn't have.
 */
const ConnectionNodeLists: React.FC<{
  connections: CellConnections;
  onNavigate: (node: NodeRef) => void;
}> = ({ connections, onNavigate }) => {
  const grid = useFocusGrid();

  return (
    <div className={contentsStyle} ref={(element) => grid.attach(element)}>
      <NodeSection
        title="Upstream — dependencies"
        direction="upstream"
        nodes={connections.upstream}
        onNavigate={onNavigate}
        grid={grid}
        baseIndex={0}
      />
      <NodeSection
        title="Downstream — dependents"
        direction="downstream"
        nodes={connections.downstream}
        onNavigate={onNavigate}
        grid={grid}
        baseIndex={connections.upstream.length}
      />
    </div>
  );
};

/** Everything the whole-net diagram needs to draw and highlight itself. */
export type ExplorerGraph = {
  net: NetGraph;
  /** The selected place or transition, or null for any other selection. */
  selectedId: string | null;
  dependencyIds: ReadonlySet<string>;
  dependentIds: ReadonlySet<string>;
  placeColors: ReadonlyMap<string, string>;
  /** Set to re-layer the diagram around this node. */
  focusId: string | null;
};

export interface GraphExplorerProps {
  /** The whole net as a graph of places and transitions. */
  graph: ExplorerGraph;
  /** Connections for the selected cell, or null when nothing is selected. */
  connections: CellConnections | null;
  /** Id of the selected cell — keys the connection lists' focus memory. */
  selectedCellId: string | null;
  selectedName: string | null;
  isFocusMode: boolean;
  /** Focus mode needs a place or transition selected to have something to centre. */
  canFocus: boolean;
  onToggleFocus: () => void;
  onNavigate: (node: NodeRef) => void;
}

/**
 * The right-hand pane of the notebook view. Always draws the whole net as a
 * layered graph of places and transitions; when a node is selected it and its
 * direct dependencies and dependents are highlighted there. Below the graph,
 * the selected cell's dependencies and dependents are listed in full — those
 * lists span all cell kinds, so a place's token type and a transition's
 * parameters remain reachable.
 */
export const GraphExplorer: React.FC<GraphExplorerProps> = ({
  graph,
  connections,
  selectedCellId,
  selectedName,
  isFocusMode,
  canFocus,
  onToggleFocus,
  onNavigate,
}) => {
  // How much of the pane the lists claim; the graph fills whatever is left.
  const [listsHeight, setListsHeight] = useState(DEFAULT_LISTS_HEIGHT);

  return (
    <div className={containerStyle}>
      <div className={headerStyle}>
        <span className={titleStyle}>Graph explorer</span>
        <div className={headerActionsStyle}>
          <Button
            size="xs"
            variant={isFocusMode ? "solid" : "ghost"}
            tone="neutral"
            iconName="bullseye"
            disabled={!canFocus && !isFocusMode}
            tooltip={
              canFocus || isFocusMode
                ? "Re-organize the graph around the selected node"
                : "Select a place or transition to organize the graph around it"
            }
            aria-label="Organize graph around selection"
            aria-pressed={isFocusMode}
            onClick={onToggleFocus}
          />
        </div>
      </div>

      <div className={graphPaneStyle}>
        <NetGraphView
          graph={graph.net}
          selectedId={graph.selectedId}
          dependencyIds={graph.dependencyIds}
          dependentIds={graph.dependentIds}
          placeColors={graph.placeColors}
          focusId={graph.focusId}
          onNavigate={(node) =>
            onNavigate({ type: node.kind, id: node.id, name: node.name })
          }
        />
      </div>

      <div className={listsPaneStyle} style={{ height: listsHeight }}>
        <ResizeHandle
          edge="top"
          size={listsHeight}
          onResize={setListsHeight}
          minSize={MIN_LISTS_HEIGHT}
          maxSize={MAX_LISTS_HEIGHT}
          label="Resize the connection lists"
        />

        {connections === null ? (
          <span className={hintStyle}>
            Select a cell to see what it is connected to.
          </span>
        ) : (
          <>
            <span className={selectedNameStyle}>{selectedName}</span>

            <ConnectionNodeLists
              key={selectedCellId ?? "none"}
              connections={connections}
              onNavigate={onNavigate}
            />
          </>
        )}
      </div>
    </div>
  );
};
