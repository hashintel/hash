import { useEffect, useRef } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useLatest } from "../../../../react/hooks/use-latest";
import { focusLands } from "../../../worksheet/focus-flow";
import { useFocusStops } from "../../../worksheet/use-focus-stops";
import { CONNECTION_GUTTER_WIDTH } from "../connection-gutter";
import { ConnectionLines } from "../connection-lines";
import { CellBody, NotebookCell } from "../notebook-cell";
import { cellBodyParts, partStopId } from "../notebook-cell/cell-body-parts";
import { cellPresentation } from "../notebook-cell/cell-summary";

import type { ActiveNetDefinition } from "../../../../react/state/active-net-context";
import type { FocusStop } from "../../../worksheet/use-focus-stops";
import type { CellRowActions } from "../notebook-cell";
import type {
  CellConnections,
  CellRef,
  DependentCount,
  NotebookCell as NotebookCellModel,
} from "../notebook-model";

const listStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  overflowY: "auto",
});

const contentStyle = css({
  position: "relative",
  paddingY: "3",
});

const emptyStyle = css({
  fontSize: "sm",
  color: "neutral.fg.subtle",
  padding: "4",
});

/**
 * The cells as one member of the worksheet focus flow, with the connector
 * lines of the selected cell in its gutters.
 */
export const CellList = ({
  net,
  cells,
  navigableCells,
  emptyMessage,
  expandedIds,
  matchesById,
  dependentCounts,
  selectedId,
  selectedConnections,
  onSelectCell,
  onSetCellExpanded,
  onNavigateToCell,
  onFocusSearch,
}: {
  net: ActiveNetDefinition;
  /** The cells listed: every cell of a kind the filter shows. */
  cells: NotebookCellModel[];
  /** The cells arrows walk: `cells`, narrowed to the matches of a search. */
  navigableCells: NotebookCellModel[];
  /** Shown in place of the cells when there are none. */
  emptyMessage: string;
  expandedIds: ReadonlySet<string>;
  /** Matched name indices by cell id while a search is active, else null. */
  matchesById: Map<string, number[]> | null;
  dependentCounts: Map<string, DependentCount>;
  selectedId: string | null;
  selectedConnections: CellConnections | null;
  onSelectCell: (cell: CellRef) => void;
  onSetCellExpanded: (cellId: string, expanded: boolean) => void;
  /** Selects and focuses a cell by id, listed or not. */
  onNavigateToCell: (cellId: string) => void;
  onFocusSearch: () => void;
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // Each navigable row is a full-width stop, followed by its body parts while
  // it is expanded — so vertical arrows walk exactly what is on screen, and
  // the whole list is a single roving tab stop. A part line with several
  // cells (an arc's place, weight and type) is a sparse stop whose cells
  // horizontal arrows walk individually.
  const rowStops: FocusStop[] = navigableCells.flatMap((cell) => [
    { id: cell.id, kind: "full" as const },
    ...(expandedIds.has(cell.id)
      ? cellBodyParts(cell, net).map((part): FocusStop => {
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
  // Destructured: the compiler takes what `ref` is given for a ref and would
  // refuse the calls to `listFocus` during render.
  const { attach: attachList, ...listFocus } = useFocusStops({
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

  const actionsRef = useLatest<CellRowActions>({
    select: onSelectCell,
    setExpanded: onSetCellExpanded,
    focusRow: (cell) => {
      listFocus.onFocusTarget({ stopId: cell.id, column: 0 });
      onSelectCell(cell);
    },
    navigate: (cellId, event) =>
      listFocus.onKeyDown({ stopId: cellId, column: 0 })(event),
    focusSearch: onFocusSearch,
  });

  const revealedSelectionRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId === revealedSelectionRef.current) {
      return;
    }
    revealedSelectionRef.current = selectedId;
    if (selectedId === null) {
      return;
    }
    contentRef.current
      ?.querySelector(`[data-cell-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div ref={attachList} className={listStyle}>
      <div
        ref={contentRef}
        className={contentStyle}
        style={{
          paddingLeft: CONNECTION_GUTTER_WIDTH,
          paddingRight: CONNECTION_GUTTER_WIDTH,
        }}
      >
        {cells.length === 0 ? (
          <div className={emptyStyle}>{emptyMessage}</div>
        ) : (
          cells.map((cell) => {
            const dependents = dependentCounts.get(cell.id);
            return (
              <NotebookCell
                key={cell.id}
                cellId={cell.id}
                kind={cell.kind}
                {...cellPresentation(net, cell)}
                isSelected={cell.id === selectedId}
                isExpanded={expandedIds.has(cell.id)}
                isDimmed={matchesById !== null && !matchesById.has(cell.id)}
                nameMatchIndices={matchesById?.get(cell.id) ?? null}
                directDependents={dependents?.direct ?? 0}
                transitiveDependents={dependents?.transitive ?? 0}
                tabIndex={listFocus.tabIndexFor({ stopId: cell.id, column: 0 })}
                actionsRef={actionsRef}
              >
                {expandedIds.has(cell.id) && (
                  <CellBody
                    net={net}
                    cell={cell}
                    parts={{
                      stopIdFor: (partId) => partStopId(cell.id, partId),
                      focusFor: (partId, column = 0) => {
                        const stopId = partStopId(cell.id, partId);
                        return {
                          tabIndex: listFocus.tabIndexFor({ stopId, column }),
                          onFocus: () => {
                            listFocus.onFocusTarget({ stopId, column });
                            onSelectCell(cell);
                          },
                          onNavigate: listFocus.onKeyDown({ stopId, column }),
                        };
                      },
                      navigateToCell: onNavigateToCell,
                    }}
                  />
                )}
              </NotebookCell>
            );
          })
        )}
        <ConnectionLines
          containerRef={contentRef}
          selectedId={selectedId}
          visibleCellIds={cells.map(({ id }) => id)}
          upstreamIds={(selectedConnections?.upstream ?? []).map(
            ({ id }) => id,
          )}
          downstreamIds={(selectedConnections?.downstream ?? []).map(
            ({ id }) => id,
          )}
        />
      </div>
    </div>
  );
};
