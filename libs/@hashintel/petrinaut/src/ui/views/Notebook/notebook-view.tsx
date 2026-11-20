import { use, useEffect, useRef, useState, type ReactNode } from "react";

import { Button, SegmentedControl, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import { useEditorState } from "../../../react/state/editor-context";
import { useUndoRedoShortcuts } from "../../../react/state/use-undo-redo-shortcuts";
import { ResizeHandle } from "../../resize/resize-handle";
import { FocusRoot, FocusStack } from "../../worksheet/focus-stack";
import { CELL_KIND_PLURAL_LABELS, CELL_KINDS } from "./cell-kinds";
import { GraphExplorer } from "./graph-explorer";
import { layoutNetGraph } from "./net-graph-layout";
import {
  buildNodeNeighbourhood,
  cellName,
  cellToSelectionItem,
  fuzzyMatchName,
  noConnections,
} from "./notebook-model";
import { orderCellsTopologically } from "./notebook-order";
import { CellList } from "./notebook-view/cell-list";
import { buildNotebookViewModel } from "./notebook-view/view-model";

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type {
  NodeRef,
  NotebookCellKind,
  NotebookCell as NotebookCellModel,
} from "./notebook-model";
import type { CellOrder } from "./notebook-order";
import type { NotebookViewModel } from "./notebook-view/view-model";

const containerStyle = css({
  display: "flex",
  flexDirection: "column",
  width: "full",
  height: "full",
  flex: "[1]",
  minHeight: "[0]",
  backgroundColor: "neutral.s00",
});

const bodyStyle = css({
  display: "flex",
  flex: "[1]",
  minHeight: "[0]",
  minWidth: "[0]",
});

const cellsColumnStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  display: "flex",
  flexDirection: "column",
});

const searchBarStyle = css({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  flexShrink: "0",
  gap: "2",
  paddingX: "3",
  paddingY: "2",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.s30",
});

const searchInputStyle = css({
  maxWidth: "[320px]",
  flex: "[1 1 200px]",
});

const matchCountStyle = css({
  fontSize: "xs",
  color: "neutral.fg.subtle",
  whiteSpace: "nowrap",
});

const filterGroupStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  marginLeft: "auto",
});

const explorerColumnStyle = css({
  position: "relative",
  flexShrink: 0,
  minWidth: "[0]",
  // The drag bound is absolute pixels; this keeps a narrow window from letting
  // the explorer squeeze the cell list to nothing.
  maxWidth: "[85%]",
  borderLeftWidth: "[1px]",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.s40",
  backgroundColor: "neutral.s00",
});

const DEFAULT_EXPLORER_WIDTH = 520;
const MIN_EXPLORER_WIDTH = 320;
const MAX_EXPLORER_WIDTH = 1100;

/** Focuses the row of a cell inside `container`; false when it has none. */
const focusRowIn = (container: HTMLElement | null, cellId: string): boolean => {
  const row = container?.querySelector<HTMLElement>(
    `[data-cell-row="${CSS.escape(cellId)}"]`,
  );
  row?.focus({ preventScroll: true });
  return row !== null && row !== undefined;
};

/**
 * The Definitions view: a code-like rendering of the net where
 * every entity (place, transition, type, differential equation, parameter)
 * is a one-line cell — inspired by Observable notebooks. Everything an
 * expanded cell shows edits in place through the same mutations as the
 * properties panel — names, fields, arc weights, type assignments, and the
 * code editors; only adding and removing nodes, arcs, and fields stays in
 * Canvas view. Cells are
 * closed by default and stay as the user leaves them: the caret or
 * ArrowRight/ArrowLeft opens and closes, ArrowUp/ArrowDown moves the
 * selection, and "/" focuses the fuzzy name search. Selecting a cell draws
 * angled connector lines in the gutters to its dependencies (left) and
 * dependents (right), and lists them in the explorer on the right —
 * dependencies span every kind, so a place links to its type and equation
 * and a transition links to the parameters its code reads. The toolbar
 * controls the cell order (document or topological) and which kinds are listed
 * and searched; rows with dependents end with how many cells depend on them,
 * directly and in total.
 */
type NotebookViewProps = { toolbarStart?: ReactNode };

const NotebookViewContent = ({
  net,
  model: {
    documentCells,
    connectionIndex,
    dependentCounts,
    netGraph,
    placeColors,
  },
  toolbarStart,
}: NotebookViewProps & {
  net: ActiveNetDefinition;
  model: NotebookViewModel;
}) => {
  // By selector: every cell of the notebook renders with this component.
  const selection = useEditorState((editor) => editor.selection);
  const selectItem = useEditorState((editor) => editor.selectItem);

  // The canvas BottomBar (which owns the editor-wide shortcuts) isn't
  // active in Definitions view, so undo/redo is bound here.
  useUndoRedoShortcuts();

  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [explorerWidth, setExplorerWidth] = useState(DEFAULT_EXPLORER_WIDTH);
  const [cellOrder, setCellOrder] = useState<CellOrder>("document");
  const [focusOnSelection, setFocusOnSelection] = useState(false);
  const [visibleKinds, setVisibleKinds] = useState<
    ReadonlySet<NotebookCellKind>
  >(() => new Set(CELL_KINDS));

  const cellsColumnRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Navigation can reveal a filtered-out kind, in which case the row to focus
  // doesn't exist until after the re-render — so a miss is parked here and
  // retried by the effect below once the row is in the DOM.
  const pendingFocusCellIdRef = useRef<string | null>(null);
  // One retry is enough: the reveal of the hidden kind lands in the very next
  // render, and clearing unconditionally means a deleted cell can't leave a
  // stale id behind to steal focus later.
  useEffect(() => {
    if (pendingFocusCellIdRef.current !== null) {
      focusRowIn(cellsColumnRef.current, pendingFocusCellIdRef.current);
      pendingFocusCellIdRef.current = null;
    }
  });

  // The topological list follows the diagram's default layer order (not the
  // focused re-layout, which is a transient lens on the same net), with
  // declarations inlined before their first user.
  const cells =
    cellOrder === "document"
      ? documentCells
      : orderCellsTopologically(
          documentCells,
          layoutNetGraph(netGraph).nodes.map(({ id }) => id),
          connectionIndex,
        );
  const visibleCells = cells.filter(({ kind }) => visibleKinds.has(kind));

  const query = searchQuery.trim();
  const matchesById = new Map<string, number[]>();
  if (query !== "") {
    for (const cell of visibleCells) {
      const match = fuzzyMatchName(query, cellName(cell));
      if (match !== null) {
        matchesById.set(cell.id, match);
      }
    }
  }
  const isSearching = query !== "";
  // The rows arrows walk and the search box steps through: every visible
  // cell, narrowed to the matches while a search is active.
  const navigableCells = isSearching
    ? visibleCells.filter(({ id }) => matchesById.has(id))
    : visibleCells;

  // A single selection carried over from the canvas can be something the
  // notebook has no cell for (an arc, a component instance), so the view
  // keys off the resolved cell rather than the raw selection.
  const selectedItemId =
    selection.size === 1 ? [...selection.values()][0]!.id : null;
  const selectedCell =
    selectedItemId === null
      ? undefined
      : cells.find(({ id }) => id === selectedItemId);
  const selectedId = selectedCell?.id ?? null;
  const selectedName =
    selectedCell === undefined ? null : cellName(selectedCell);

  const selectedConnections =
    selectedCell === undefined
      ? null
      : (connectionIndex.get(selectedCell.id) ?? noConnections());

  // The diagram always shows the whole net; a selected place or transition
  // just decides what gets highlighted within it. Nodes reachable both ways
  // count as a dependency and a dependent, so they light up on both sides.
  const neighbourhood =
    selectedConnections === null
      ? null
      : buildNodeNeighbourhood(selectedConnections);
  const selectedNodeId =
    selectedCell !== undefined &&
    (selectedCell.kind === "place" || selectedCell.kind === "transition")
      ? selectedCell.id
      : null;

  const explorerGraph = {
    net: netGraph,
    selectedId: selectedNodeId,
    dependencyIds: new Set(
      [
        ...(neighbourhood?.dependencies ?? []),
        ...(neighbourhood?.bidirectional ?? []),
      ].map(({ id }) => id),
    ),
    dependentIds: new Set(
      [
        ...(neighbourhood?.dependents ?? []),
        ...(neighbourhood?.bidirectional ?? []),
      ].map(({ id }) => id),
    ),
    placeColors,
    focusId: focusOnSelection ? selectedNodeId : null,
  };

  const setCellExpanded = (cellId: string, expanded: boolean) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (expanded) {
        next.add(cellId);
      } else {
        next.delete(cellId);
      }
      return next;
    });
  };

  const toggleKind = (kind: NotebookCellKind) => {
    setVisibleKinds((previous) => {
      const next = new Set(previous);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  };

  const focusCellRow = (cellId: string) => {
    if (!focusRowIn(cellsColumnRef.current, cellId)) {
      pendingFocusCellIdRef.current = cellId;
    }
  };

  const selectCell = (
    cell: NotebookCellModel,
    options?: { focus?: boolean },
  ) => {
    selectItem(cellToSelectionItem(cell));
    if (options?.focus) {
      focusCellRow(cell.id);
    }
  };

  const navigateToNode = (node: NodeRef) => {
    // Jumping to a kind the filter hides would select an invisible cell, so
    // reveal that kind as part of the navigation.
    if (!visibleKinds.has(node.type)) {
      setVisibleKinds((previous) => new Set(previous).add(node.type));
    }
    selectItem({ type: node.type, id: node.id });
    focusCellRow(node.id);
  };

  const navigateToCell = (cellId: string) => {
    const target = cells.find(({ id }) => id === cellId);
    if (target) {
      selectCell(target, { focus: true });
    }
  };

  /**
   * Step the selection to the next/previous navigable cell without moving
   * focus, so arrows work from the search box while typing continues.
   * Wraps around at both ends.
   */
  const stepSelection = (direction: 1 | -1) => {
    if (navigableCells.length === 0) {
      return;
    }
    const currentIndex = navigableCells.findIndex(
      ({ id }) => id === selectedId,
    );
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : navigableCells.length - 1
        : (currentIndex + direction + navigableCells.length) %
          navigableCells.length;
    selectCell(navigableCells[nextIndex]!);
  };

  const focusSearch = () => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  };

  return (
    <div className={containerStyle}>
      <div className={searchBarStyle}>
        {toolbarStart}
        <TextInput
          className={searchInputStyle}
          size="sm"
          value={searchQuery}
          onChange={(value) => setSearchQuery(value)}
          placeholder={`Search definitions… ("/" to focus)`}
          prefix={{ iconName: "search" }}
          clearable
          inputRef={searchInputRef}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              stepSelection(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              stepSelection(-1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              const firstMatch = visibleCells.find(({ id }) =>
                matchesById.has(id),
              );
              if (firstMatch) {
                selectCell(firstMatch, { focus: true });
              }
            } else if (event.key === "Escape") {
              setSearchQuery("");
              (event.target as HTMLElement).blur();
            }
          }}
        />
        {isSearching && (
          <span className={matchCountStyle}>
            {matchesById.size} match{matchesById.size === 1 ? "" : "es"}
          </span>
        )}
        <SegmentedControl<CellOrder>
          size="xs"
          value={cellOrder}
          items={[
            {
              value: "document",
              label: "Document",
              tooltip: "List cells in the order the net stores them",
            },
            {
              value: "topological",
              label: "Topological",
              tooltip:
                "Follow token flow, with each type, equation and parameter inlined just before its first use",
            },
          ]}
          onChange={setCellOrder}
        />

        <div className={filterGroupStyle}>
          {CELL_KINDS.map((kind) => (
            <Button
              key={kind}
              size="xs"
              variant={visibleKinds.has(kind) ? "solid" : "ghost"}
              tone="neutral"
              aria-pressed={visibleKinds.has(kind)}
              onClick={() => toggleKind(kind)}
            >
              {CELL_KIND_PLURAL_LABELS[kind]}
            </Button>
          ))}
        </div>
      </div>

      <div className={bodyStyle}>
        <div ref={cellsColumnRef} className={cellsColumnStyle}>
          <CellList
            net={net}
            cells={visibleCells}
            navigableCells={navigableCells}
            emptyMessage={
              cells.length === 0
                ? "This net is empty — switch to Canvas to add places and transitions."
                : "All cell kinds are filtered out — enable a kind above to see cells."
            }
            expandedIds={expandedIds}
            matchesById={isSearching ? matchesById : null}
            dependentCounts={dependentCounts}
            selectedId={selectedId}
            selectedConnections={selectedConnections}
            onSelectCell={selectCell}
            onSetCellExpanded={setCellExpanded}
            onNavigateToCell={navigateToCell}
            onFocusSearch={focusSearch}
          />
        </div>

        <div className={explorerColumnStyle} style={{ width: explorerWidth }}>
          <ResizeHandle
            edge="left"
            getSize={() => explorerWidth}
            onResize={setExplorerWidth}
            minSize={MIN_EXPLORER_WIDTH}
            maxSize={MAX_EXPLORER_WIDTH}
            label="Resize the graph explorer"
          />
          <GraphExplorer
            connections={selectedConnections}
            selectedCellId={selectedId}
            selectedName={selectedName}
            graph={explorerGraph}
            isFocusMode={focusOnSelection}
            canFocus={selectedNodeId !== null}
            onToggleFocus={() => setFocusOnSelection((previous) => !previous)}
            onNavigate={navigateToNode}
          />
        </div>
      </div>
    </div>
  );
};

export const NotebookView = ({ toolbarStart }: NotebookViewProps) => {
  const { activeNet } = use(ActiveNetContext);
  // Built above the component that holds the view's state and passed as a
  // prop, so that the compiler derives it again for a new net only.
  const model = buildNotebookViewModel(activeNet);

  return (
    // The stack must sit above the component whose hooks join the flow: a
    // hook reads the context of its own component's position, so a stack
    // rendered inside NotebookViewContent could never enrol its list.
    <FocusRoot>
      <FocusStack axis="horizontal">
        <NotebookViewContent
          net={activeNet}
          model={model}
          toolbarStart={toolbarStart}
        />
      </FocusStack>
    </FocusRoot>
  );
};
