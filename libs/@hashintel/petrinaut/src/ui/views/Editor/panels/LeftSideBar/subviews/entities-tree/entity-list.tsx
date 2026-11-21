import {
  Fragment,
  use,
  useDeferredValue,
  useId,
  useReducer,
  useRef,
} from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useEditorActions } from "../../../../../../../react/state/editor-context";
import { focusLands } from "../../../../../../worksheet/focus-flow";
import { useFocusStops } from "../../../../../../worksheet/use-focus-stops";
import { CollapsedGroupsContext } from "./collapsed-groups-context";
import { firstEntityRows, selectionItemOf } from "./entity-groups";
import { EmptyGroupRow, EntityRow, GroupRow } from "./entity-rows";

import type { FocusStop } from "../../../../../../worksheet/use-focus-stops";
import type { EntityGroup, EntityItem } from "./entity-groups";
import type { SelectionMap } from "@hashintel/petrinaut-core";

const listContainerStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  flex: "[1]",
  /** Reduce horizontal padding from the parent */
  mx: "-1",
  /** Enable animating height to/from `auto` for collapsible group children */
  interpolateSize: "[allow-keywords]",
});

/** Wrapper around a group's children that animates height on collapse/expand */
const groupChildrenStyle = css({
  overflow: "hidden",
  transition: "[height 150ms ease-out]",
});

/** More entities than a sidebar of any height shows at once. */
const ENTITIES_MOUNTED_FIRST = 80;

type Row = EntityItem | EntityGroup;

const isGroup = (row: Row): row is EntityGroup => "children" in row;

/** Whether an event came from a row's action button, and not from the row. */
const isInRowAction = (target: EventTarget): boolean =>
  target instanceof Element && target.closest("[data-row-action]") !== null;

/**
 * The rows whose menu is mounted: the one last pointed at and the one last
 * focused, which are the only two that can show a menu. A menu is a few dozen
 * components that render again whenever the editor's state changes, and the
 * list has one row per entity of the net.
 *
 * Neither is cleared when the pointer or focus leaves. An open menu draws its
 * items outside the row, and must outlive the pointer moving onto them.
 */
interface MenuRows {
  pointed: string | null;
  focused: string | null;
}

const menuRowsAfter = (
  rows: MenuRows,
  [cause, id]: ["pointed" | "focused", string],
): MenuRows => (rows[cause] === id ? rows : { ...rows, [cause]: id });

/**
 * The entities of a net as a list of selectable rows under collapsible group
 * headers. Arrows walk the rows and select as they move, Shift extends a
 * range, and a row's menu or a header's action is one ArrowRight away.
 *
 * The rows take no click or key handler: the list handles those itself and
 * finds the row by its element, so a row renders only for what it shows. A
 * row only reports that the pointer or the focus reached it, which tells the
 * list whose menu to mount.
 */
export const EntityList: React.FC<{ groups: EntityGroup[] }> = ({ groups }) => {
  const { selectItem, toggleItem, clearSelection, setSelection } =
    useEditorActions();
  // Row elements are found by id, which this prefix keeps apart from the ids
  // of any other list.
  const listId = useId();
  const { collapsedGroups, toggleGroup } = use(CollapsedGroupsContext);
  const [menuRows, showMenu] = useReducer(menuRowsAfter, {
    pointed: null,
    focused: null,
  });
  // The Shift-range anchor: the entity the last plain selection landed on.
  const anchorId = useRef<string | null>(null);
  // A long list mounts in two steps: the rows a sidebar can show, then the
  // rows below them, in a render that React interrupts for a frame. The rows
  // of several hundred entities would otherwise hold back the frame in which
  // the sidebar opens.
  const mountsEveryRow = useDeferredValue(true, false);
  const mountedGroups = mountsEveryRow
    ? groups
    : firstEntityRows(groups, ENTITIES_MOUNTED_FIRST);

  // The rows the keyboard flow walks, in document order. A collapsed group's
  // children stay mounted for the height animation; they are out of `stops`,
  // so `tabIndexFor` keeps them out of the tab order.
  const visibleRows = groups.flatMap((group): Row[] =>
    collapsedGroups.has(group.id) ? [group] : [group, ...group.children],
  );
  const stops: FocusStop[] = visibleRows.map((row) => ({
    id: row.id,
    kind: "row",
  }));
  const {
    onKeyDown: onStopsKeyDown,
    onFocusTarget,
    tabIndexFor,
    attach,
  } = useFocusStops({
    stops,
    // Column 0 is the row, column 1 its action button (menu or add).
    columnCount: 2,
    focusTarget: ({ stopId, column }) => {
      const row = document.getElementById(listId + stopId);
      return focusLands(
        column === 0
          ? row
          : row?.querySelector<HTMLElement>("[data-row-action] button"),
      );
    },
  });

  /** The row an element is part of, among the visible rows unless given others. */
  const rowAt = (
    target: EventTarget | null,
    rows: Row[] = visibleRows,
  ): Row | undefined => {
    const element =
      target instanceof Element ? target.closest("[role=option]") : null;
    return element
      ? rows.find((row) => listId + row.id === element.id)
      : undefined;
  };

  const select = (entity: EntityItem) => {
    selectItem(selectionItemOf(entity));
    anchorId.current = entity.id;
  };

  const selectRange = (toId: string) => {
    const ids = visibleRows.map((row) => row.id);
    const toIndex = ids.indexOf(toId);
    if (toIndex === -1) {
      return;
    }
    const anchorIndex =
      anchorId.current === null ? -1 : ids.indexOf(anchorId.current);
    const fromIndex = anchorIndex === -1 ? toIndex : anchorIndex;
    const selection: SelectionMap = new Map();
    for (const row of visibleRows.slice(
      Math.min(fromIndex, toIndex),
      Math.max(fromIndex, toIndex) + 1,
    )) {
      if (!isGroup(row)) {
        selection.set(row.id, selectionItemOf(row));
      }
    }
    setSelection(selection);
  };

  const clear = () => {
    clearSelection();
    anchorId.current = null;
  };

  const onClick = (event: React.MouseEvent) => {
    // A collapsed group's rows stay mounted while their height animates: a
    // click that still reaches one selects it.
    const row = rowAt(
      event.target,
      groups.flatMap((group): Row[] => [group, ...group.children]),
    );
    if (!row) {
      clear();
      return;
    }
    event.stopPropagation();
    if (isGroup(row)) {
      toggleGroup(row.id);
    } else if (event.shiftKey && anchorId.current !== null) {
      selectRange(row.id);
    } else if (event.metaKey || event.ctrlKey) {
      toggleItem(selectionItemOf(row));
      anchorId.current = row.id;
    } else {
      select(row);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      clear();
      return;
    }
    const row = rowAt(event.target);
    if (!row) {
      return;
    }
    if (isInRowAction(event.target)) {
      onStopsKeyDown({ stopId: row.id, column: 1 })(event);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      if (isGroup(row)) {
        toggleGroup(row.id);
      } else {
        select(row);
      }
      return;
    }
    // A group header owns the horizontal arrow that changes its state; the
    // other one falls through to the flow (ArrowRight on an expanded group
    // reaches its action button).
    if (
      isGroup(row) &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      const collapsed = collapsedGroups.has(row.id);
      if (event.key === "ArrowRight" ? collapsed : !collapsed) {
        event.preventDefault();
        event.stopPropagation();
        toggleGroup(row.id);
        return;
      }
    }
    onStopsKeyDown({ stopId: row.id, column: 0 })(event);
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      // Arrows select as they move: the row that took focus is selected.
      const landed = rowAt(document.activeElement);
      if (landed && !isGroup(landed)) {
        if (event.shiftKey) {
          selectRange(landed.id);
        } else {
          select(landed);
        }
      }
    }
  };

  return (
    <div
      ref={attach}
      className={listContainerStyle}
      role="listbox"
      aria-multiselectable="true"
      tabIndex={-1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        // Focus in an open menu, drawn outside the list, finds no row here.
        const row = rowAt(event.target);
        if (row) {
          onFocusTarget({
            stopId: row.id,
            column: isInRowAction(event.target) ? 1 : 0,
          });
        }
      }}
    >
      {mountedGroups.map((group) => {
        const expanded = !collapsedGroups.has(group.id);
        return (
          <Fragment key={group.id}>
            <GroupRow
              elementId={listId + group.id}
              id={group.id}
              showMenu={showMenu}
              name={group.name}
              expanded={expanded}
              action={group.action}
              tabIndex={tabIndexFor({ stopId: group.id, column: 0 })}
            />
            <div
              className={groupChildrenStyle}
              style={{ height: expanded ? "auto" : 0 }}
            >
              {group.children.length > 0 ? (
                group.children.map((entity) => (
                  <EntityRow
                    key={entity.id}
                    elementId={listId + entity.id}
                    {...entity}
                    tabIndex={tabIndexFor({ stopId: entity.id, column: 0 })}
                    menuMounted={
                      menuRows.pointed === entity.id ||
                      menuRows.focused === entity.id
                    }
                    showMenu={showMenu}
                  />
                ))
              ) : (
                <EmptyGroupRow message={group.emptyGroupMessage} />
              )}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
};
