import { use, useEffect, useEffectEvent, useRef, useState } from "react";

import { Button, SegmentedControl, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import { EditorContext } from "../../../react/state/editor-context";
import { useUndoRedoShortcuts } from "../../../react/state/use-undo-redo-shortcuts";
import { ResizeHandle } from "../../resize/resize-handle";
import { focusLands } from "../../worksheet/focus-flow";
import { FocusRoot, FocusStack } from "../../worksheet/focus-stack";
import { useFocusStops } from "../../worksheet/use-focus-stops";
import { CELL_KIND_PLURAL_LABELS, CELL_KINDS } from "./cell-kinds";
import { CommandPalette } from "./command-palette";
import { CONNECTION_GUTTER_WIDTH, ConnectionLines } from "./connection-lines";
import { GraphExplorer } from "./graph-explorer";
import { buildCycleMembership, findCycleGroups } from "./net-cycles";
import { layoutNetGraph } from "./net-graph-layout";
import {
  buildInitialPlaceMembership,
  findInitialPlaceGroups,
} from "./net-siphons";
import { cellBodyParts, NotebookCell, partStopId } from "./notebook-cell";
import {
  buildConnectionIndex,
  buildDependentCounts,
  buildNetGraph,
  buildNodeNeighbourhood,
  buildNotebookCells,
  cellName,
  cellToSelectionItem,
  fuzzyMatchName,
  noConnections,
} from "./notebook-model";
import { orderCellsTopologically } from "./notebook-order";
import { useJumpHistory } from "./use-jump-history";

import type { FocusStop } from "../../worksheet/use-focus-stops";
import type { PaletteAction } from "./command-palette";
import type { InitialPlaceGroup } from "./net-siphons";
import type {
  NodeRef,
  NotebookCellKind,
  NotebookCell as NotebookCellModel,
} from "./notebook-model";
import type { CellOrder } from "./notebook-order";

const containerStyle = css({
  display: "flex",
  flexDirection: "row",
  width: "full",
  height: "full",
  backgroundColor: "neutral.s00",
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
  gap: "2",
  paddingX: "4",
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

const cellListStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  overflowY: "auto",
});

const cellListContentStyle = css({
  position: "relative",
  paddingY: "3",
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

/**
 * Put the places the initial state has to seed at the front of the flow order,
 * so a resource pool inside a cycle reads alongside the net's plain sources
 * rather than buried wherever the layering happened to put it.
 */
const hoistInitialPlaces = (
  flowOrder: string[],
  initialByPlace: ReadonlyMap<string, InitialPlaceGroup>,
): string[] => [
  ...flowOrder.filter((id) => initialByPlace.has(id)),
  ...flowOrder.filter((id) => !initialByPlace.has(id)),
];

const emptyStyle = css({
  fontSize: "sm",
  color: "neutral.fg.subtle",
  padding: "4",
});

/**
 * The experimental Notebook view: a code-like rendering of the net where
 * every entity (place, transition, type, differential equation, parameter)
 * is a one-line cell — inspired by Observable notebooks. Everything an
 * expanded cell shows edits in place through the same mutations as the
 * properties panel — names, fields, arc weights, type assignments, and the
 * code editors; only adding and removing nodes, arcs, and fields stays in
 * Edit mode. Cells are
 * closed by default and stay as the user leaves them: the caret or
 * ArrowRight/ArrowLeft opens and closes, ArrowUp/ArrowDown moves the
 * selection, and "/" focuses the fuzzy name search. Selecting a cell draws
 * angled connector lines in the gutters to its dependencies (left) and
 * dependents (right), and lists them in the explorer on the right —
 * dependencies span every kind, so a place links to its type and equation
 * and a transition links to the parameters its code reads. The toolbar
 * controls the cell order (document or topological) and which kinds are listed
 * and searched; rows with dependents end with how many cells depend on them,
 * directly and in total, and cells caught in a cycle carry a matching badge.
 */
const NotebookViewContent: React.FC = () => {
  const { activeNet } = use(ActiveNetContext);
  const { selection, selectItem } = use(EditorContext);

  // The canvas BottomBar (which owns the editor-wide shortcuts) isn't
  // mounted in notebook mode, so undo/redo is bound here.
  useUndoRedoShortcuts();

  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(DEFAULT_EXPLORER_WIDTH);
  const [cellOrder, setCellOrder] = useState<CellOrder>("document");
  const [focusOnSelection, setFocusOnSelection] = useState(false);
  const [hoveredCycleKey, setHoveredCycleKey] = useState<string | null>(null);
  const [visibleKinds, setVisibleKinds] = useState<
    ReadonlySet<NotebookCellKind>
  >(() => new Set(CELL_KINDS));

  const documentCells = buildNotebookCells(activeNet);
  const connectionIndex = buildConnectionIndex(activeNet);
  const dependentCounts = buildDependentCounts(connectionIndex);
  const netGraph = buildNetGraph(activeNet);
  const cycleGroups = findCycleGroups(netGraph);
  const cycleByNode = buildCycleMembership(cycleGroups);
  const initialGroups = findInitialPlaceGroups(activeNet);
  const initialByPlace = buildInitialPlaceMembership(initialGroups);

  // The topological list follows the diagram's default layer order (not the
  // focused re-layout, which is a transient lens on the same net), with
  // declarations inlined before their first user and seed places hoisted.
  const cells =
    cellOrder === "document"
      ? documentCells
      : orderCellsTopologically(
          documentCells,
          hoistInitialPlaces(
            layoutNetGraph(netGraph).nodes.map(({ id }) => id),
            initialByPlace,
          ),
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

  // Token-type colour per place, so the diagram can echo the canvas palette.
  const placeColors = new Map<string, string>(
    activeNet.places.flatMap((place) => {
      const color = activeNet.types.find(({ id }) => id === place.colorId);
      return color === undefined
        ? []
        : [[place.id, color.displayColor] as const];
    }),
  );

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
    cycleByNode,
    initialByPlace,
    hoveredCycleKey,
    focusId: focusOnSelection ? selectedNodeId : null,
  };

  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The cell list is one member of the worksheet focus flow: each navigable
  // row is a full-width stop, followed by its body parts while it is
  // expanded — so vertical arrows walk exactly what is on screen, and the
  // whole list is a single roving tab stop. A part line with several cells
  // (an arc's place, weight and type) is a sparse stop whose cells
  // horizontal arrows walk individually.
  const rowStops: FocusStop[] = navigableCells.flatMap((cell) => [
    { id: cell.id, kind: "full" as const },
    ...(expandedIds.has(cell.id)
      ? cellBodyParts(cell, activeNet).map((part): FocusStop => {
          const stopId = partStopId(cell.id, part.id);
          return part.columns > 1
            ? {
                id: stopId,
                kind: "sparse",
                columns: Array.from({ length: part.columns }, (_, at) => at),
              }
            : { id: stopId, kind: "full" };
        })
      : []),
  ]);
  const maxPartColumns = Math.max(
    1,
    ...rowStops.map((stop) =>
      stop.kind === "sparse" ? stop.columns.length : 1,
    ),
  );
  const listFocus = useFocusStops({
    stops: rowStops,
    columnCount: maxPartColumns,
    focusTarget: ({ stopId, column }) => {
      const content = contentRef.current;
      if (!content) {
        return false;
      }
      const escaped = CSS.escape(stopId);
      // A declared column with no matching cell (or column 0 on a full-width
      // part, which carries no column attribute) falls back to the line's
      // first focusable element.
      const target =
        (typeof column === "number"
          ? content.querySelector<HTMLElement>(
              `[data-cell-part="${escaped}"][data-part-column="${String(column)}"]`,
            )
          : null) ??
        content.querySelector<HTMLElement>(
          `[data-cell-row="${escaped}"], [data-cell-part="${escaped}"]`,
        );
      return focusLands(target);
    },
  });

  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    contentRef.current
      ?.querySelector(`[data-cell-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

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

  // Navigation can reveal a filtered-out kind, in which case the row to focus
  // doesn't exist until after the re-render — so a miss is parked here and
  // retried by the effect below once the row is in the DOM.
  const pendingFocusCellIdRef = useRef<string | null>(null);

  const focusRowElement = (cellId: string): boolean => {
    const row = contentRef.current?.querySelector<HTMLElement>(
      `[data-cell-row="${CSS.escape(cellId)}"]`,
    );
    row?.focus({ preventScroll: true });
    return row !== null && row !== undefined;
  };

  // One retry is enough: the reveal of the hidden kind lands in the very next
  // render, and clearing unconditionally means a deleted cell can't leave a
  // stale id behind to steal focus later.
  useEffect(() => {
    if (pendingFocusCellIdRef.current !== null) {
      focusRowElement(pendingFocusCellIdRef.current);
      pendingFocusCellIdRef.current = null;
    }
  });

  const focusCellRow = (cellId: string) => {
    if (!focusRowElement(cellId)) {
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

  const jumps = useJumpHistory();

  /**
   * Teleport to a cell — a reference jump rather than an arrow move. The
   * target's kind is revealed if the filter hides it, and the jump lands in
   * the history so back/forward can retrace it.
   */
  const jumpToCell = (cellId: string, options?: { recordJump?: boolean }) => {
    const target = cells.find(({ id }) => id === cellId);
    if (target === undefined) {
      return;
    }
    if (options?.recordJump ?? true) {
      jumps.record(selectedId, cellId);
    }
    if (!visibleKinds.has(target.kind)) {
      setVisibleKinds((previous) => new Set(previous).add(target.kind));
    }
    selectCell(target, { focus: true });
  };

  const goBack = () => {
    const target = jumps.back(selectedId);
    if (target !== null) {
      jumpToCell(target, { recordJump: false });
    }
  };

  const goForward = () => {
    const target = jumps.forward(selectedId);
    if (target !== null) {
      jumpToCell(target, { recordJump: false });
    }
  };

  // View-level shortcuts. ⌘K opens the palette from anywhere except a code
  // editor (Monaco owns ⌘K chords); Alt+←/→ retrace jumps browser-style,
  // except in inputs and editors (word-wise caret movement on some
  // platforms).
  const handleViewShortcut = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const inCodeEditor = target.closest(".monaco-editor") !== null;
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "k" &&
      !inCodeEditor
    ) {
      event.preventDefault();
      setPaletteOpen((open) => !open);
      return;
    }
    if (
      !event.altKey ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    ) {
      return;
    }
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      inCodeEditor
    ) {
      return;
    }
    event.preventDefault();
    if (event.key === "ArrowLeft") {
      goBack();
    } else {
      goForward();
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", handleViewShortcut);
    return () => window.removeEventListener("keydown", handleViewShortcut);
  }, []);

  const navigateToNode = (node: NodeRef) => {
    jumpToCell(node.id);
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

  const paletteActions: PaletteAction[] = [
    {
      id: "toggle-order",
      label: "Toggle cell order",
      hint:
        cellOrder === "document"
          ? "document → topological"
          : "topological → document",
      run: () =>
        setCellOrder(cellOrder === "document" ? "topological" : "document"),
    },
    {
      id: "expand-all",
      label: "Expand all cells",
      run: () => setExpandedIds(new Set(visibleCells.map(({ id }) => id))),
    },
    {
      id: "collapse-all",
      label: "Collapse all cells",
      run: () => setExpandedIds(new Set()),
    },
    {
      id: "show-all-kinds",
      label: "Show all cell kinds",
      run: () => setVisibleKinds(new Set(CELL_KINDS)),
    },
    ...CELL_KINDS.map(
      (kind): PaletteAction => ({
        id: `toggle-${kind}`,
        label: `Toggle ${CELL_KIND_PLURAL_LABELS[kind].toLowerCase()}`,
        hint: visibleKinds.has(kind) ? "shown" : "hidden",
        run: () => toggleKind(kind),
      }),
    ),
    {
      id: "toggle-focus-mode",
      label: "Organize graph around selection",
      hint: focusOnSelection ? "on" : "off",
      run: () => setFocusOnSelection((previous) => !previous),
    },
    {
      id: "focus-search",
      label: "Search cells",
      hint: "/",
      run: () => focusSearch(),
    },
  ];

  return (
    <div className={containerStyle}>
      <div className={cellsColumnStyle}>
        <div className={searchBarStyle}>
          <Button
            size="xs"
            variant="ghost"
            tone="neutral"
            iconName="arrowLeft"
            aria-label="Back to the previous cell"
            tooltip="Back through jumps (⌥←)"
            disabled={!jumps.canGoBack}
            onClick={goBack}
          />
          <Button
            size="xs"
            variant="ghost"
            tone="neutral"
            iconName="arrowRight"
            aria-label="Forward to the next cell"
            tooltip="Forward through jumps (⌥→)"
            disabled={!jumps.canGoForward}
            onClick={goForward}
          />
          <TextInput
            className={searchInputStyle}
            size="sm"
            value={searchQuery}
            onChange={(value) => setSearchQuery(value)}
            placeholder={`Search cells… ("/" to focus)`}
            prefix={{ iconName: "search" }}
            clearable={{
              clearable: searchQuery !== "",
              onClear: () => setSearchQuery(""),
            }}
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
                  jumpToCell(firstMatch.id);
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

        <div className={cellListStyle}>
          <div
            ref={(element) => {
              contentRef.current = element;
              listFocus.attach(element);
            }}
            className={cellListContentStyle}
            style={{
              paddingLeft: CONNECTION_GUTTER_WIDTH,
              paddingRight: CONNECTION_GUTTER_WIDTH,
            }}
          >
            {cells.length === 0 ? (
              <div className={emptyStyle}>
                This net is empty — switch to Edit mode to add places and
                transitions.
              </div>
            ) : visibleCells.length === 0 ? (
              <div className={emptyStyle}>
                All cell kinds are filtered out — enable a kind above to see
                cells.
              </div>
            ) : (
              visibleCells.map((cell) => (
                <NotebookCell
                  key={cell.id}
                  net={activeNet}
                  cell={cell}
                  isSelected={cell.id === selectedId}
                  isExpanded={expandedIds.has(cell.id)}
                  isDimmed={isSearching && !matchesById.has(cell.id)}
                  nameMatchIndices={matchesById.get(cell.id) ?? null}
                  dependentCount={dependentCounts.get(cell.id)}
                  cycle={cycleByNode.get(cell.id)}
                  initialGroup={initialByPlace.get(cell.id)}
                  isCycleHovered={
                    hoveredCycleKey !== null &&
                    cycleByNode.get(cell.id)?.key === hoveredCycleKey
                  }
                  onHoverCycle={setHoveredCycleKey}
                  onSelect={() => selectCell(cell)}
                  onSetExpanded={(expanded) =>
                    setCellExpanded(cell.id, expanded)
                  }
                  rowFocus={{
                    tabIndex: listFocus.tabIndexFor({
                      stopId: cell.id,
                      column: 0,
                    }),
                    onFocus: () => {
                      listFocus.onFocusTarget({
                        stopId: cell.id,
                        column: 0,
                      });
                      selectCell(cell);
                    },
                    onNavigate: listFocus.onKeyDown({
                      stopId: cell.id,
                      column: 0,
                    }),
                  }}
                  bodyParts={{
                    stopIdFor: (partId) => partStopId(cell.id, partId),
                    focusFor: (partId, column = 0) => {
                      const stopId = partStopId(cell.id, partId);
                      return {
                        tabIndex: listFocus.tabIndexFor({ stopId, column }),
                        onFocus: () => {
                          listFocus.onFocusTarget({ stopId, column });
                          selectCell(cell);
                        },
                        onNavigate: listFocus.onKeyDown({ stopId, column }),
                      };
                    },
                    navigateToCell: (cellId) => jumpToCell(cellId),
                  }}
                  onFocusSearch={focusSearch}
                />
              ))
            )}
            <ConnectionLines
              containerRef={contentRef}
              selectedId={selectedId}
              visibleCellIds={visibleCells.map(({ id }) => id)}
              upstreamIds={(selectedConnections?.upstream ?? []).map(
                ({ id }) => id,
              )}
              downstreamIds={(selectedConnections?.downstream ?? []).map(
                ({ id }) => id,
              )}
            />
          </div>
        </div>
      </div>

      {isPaletteOpen && (
        <CommandPalette
          cells={cells}
          actions={paletteActions}
          onJumpToCell={(cellId) => jumpToCell(cellId)}
          onClose={() => setPaletteOpen(false)}
        />
      )}

      <div className={explorerColumnStyle} style={{ width: explorerWidth }}>
        <ResizeHandle
          edge="left"
          size={explorerWidth}
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
          cycleGroups={cycleGroups}
          onHoverCycle={setHoveredCycleKey}
          isFocusMode={focusOnSelection}
          canFocus={selectedNodeId !== null}
          onToggleFocus={() => setFocusOnSelection((previous) => !previous)}
          onNavigate={navigateToNode}
        />
      </div>
    </div>
  );
};

export const NotebookView: React.FC = () => (
  // The stack must sit above the component whose hooks join the flow: a
  // hook reads the context of its own component's position, so a stack
  // rendered inside NotebookViewContent could never enrol its list.
  <FocusRoot>
    <FocusStack axis="horizontal">
      <NotebookViewContent />
    </FocusStack>
  </FocusRoot>
);
