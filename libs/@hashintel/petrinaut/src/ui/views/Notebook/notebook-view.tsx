import { use, useEffect, useRef, useState } from "react";

import { Button, SegmentedControl, TextInput } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../react/state/active-net-context";
import { EditorContext } from "../../../react/state/editor-context";
import { useUndoRedoShortcuts } from "../../../react/state/use-undo-redo-shortcuts";
import { focusLands } from "../../worksheet/focus-flow";
import { useFocusStops } from "../../worksheet/use-focus-stops";
import { CELL_KIND_PLURAL_LABELS, CELL_KINDS } from "./cell-kinds";
import { CONNECTION_GUTTER_WIDTH, ConnectionLines } from "./connection-lines";
import { layoutNetGraph } from "./net-graph-layout";
import { cellBodyParts, NotebookCell, partStopId } from "./notebook-cell";
import {
  buildConnectionIndex,
  buildDependentCounts,
  buildNetGraph,
  buildNotebookCells,
  cellName,
  cellToSelectionItem,
  fuzzyMatchName,
  noConnections,
} from "./notebook-model";
import { orderCellsTopologically } from "./notebook-order";

import type { FocusStop } from "../../worksheet/use-focus-stops";
import type {
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
 * dependents (right) — dependencies span every kind, so a place links to
 * its type and equation
 * and a transition links to the parameters its code reads. The toolbar
 * controls the cell order (document or topological) and which kinds are listed
 * and searched; rows with dependents end with how many cells depend on them,
 * directly and in total.
 */
export const NotebookView: React.FC = () => {
  const { activeNet } = use(ActiveNetContext);
  const { selection, selectItem } = use(EditorContext);

  // The canvas BottomBar (which owns the editor-wide shortcuts) isn't
  // mounted in notebook mode, so undo/redo is bound here.
  useUndoRedoShortcuts();

  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [cellOrder, setCellOrder] = useState<CellOrder>("document");
  const [visibleKinds, setVisibleKinds] = useState<
    ReadonlySet<NotebookCellKind>
  >(() => new Set(CELL_KINDS));

  const documentCells = buildNotebookCells(activeNet);
  const connectionIndex = buildConnectionIndex(activeNet);
  const dependentCounts = buildDependentCounts(connectionIndex);
  const netGraph = buildNetGraph(activeNet);

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

  const selectedConnections =
    selectedCell === undefined
      ? null
      : (connectionIndex.get(selectedCell.id) ?? noConnections());

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

  const focusCellRow = (cellId: string) => {
    contentRef.current
      ?.querySelector<HTMLElement>(`[data-cell-row="${CSS.escape(cellId)}"]`)
      ?.focus({ preventScroll: true });
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
      <div className={cellsColumnStyle}>
        <div className={searchBarStyle}>
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
                      listFocus.onFocusTarget({ stopId: cell.id, column: 0 });
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
                    navigateToCell: (cellId) => {
                      const target = cells.find(({ id }) => id === cellId);
                      if (target) {
                        selectCell(target, { focus: true });
                      }
                    },
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
    </div>
  );
};
