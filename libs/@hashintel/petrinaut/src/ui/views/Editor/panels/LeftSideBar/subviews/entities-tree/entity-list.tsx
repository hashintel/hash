import { Fragment, useRef, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { useEditorState } from "../../../../../../../react/state/editor-context";
import {
  DifferentialEquationIcon,
  ParameterIcon,
  PlaceFilledIcon,
  TokenTypeIcon,
  TransitionFilledIcon,
} from "../../../../../../constants/entity-icons";
import { focusLands } from "../../../../../../worksheet/focus-flow";
import { useFocusStops } from "../../../../../../worksheet/use-focus-stops";
import { RowActionCell } from "../row-action-cell";
import { EntityRowMenu } from "./entity-row-menu";

import type {
  FocusStop,
  FocusStopTarget,
} from "../../../../../../worksheet/use-focus-stops";
import type {
  EntityGroup,
  EntityItem,
  EntityTreeItem,
} from "./use-entity-tree-items";
import type { SelectionItem, SelectionMap } from "@hashintel/petrinaut-core";
import type { ComponentType } from "react";

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

const listItemRowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "1",
    minHeight: "8",
    p: "1",
    borderRadius: "lg",
    fontSize: "sm",
    fontWeight: "medium",
    color: "neutral.s115",
    backgroundColor: "[transparent]",
    cursor: "pointer",
    transition: "[background-color 100ms ease-out, opacity 150ms ease-out]",
    /* A row scrolled out of view is skipped by the browser, at the height it
       last had. Each row holds an icon of about ten SVG elements, and every
       one is laid out again whenever the editor around the list resizes. */
    contentVisibility: "auto",
    containIntrinsicSize: "[auto 32px]",

    /* Focus shows as a background change, like hover. */
    _focus: {
      outline: "none",
      backgroundColor: "neutral.s25",
    },

    /* The action button shows on hover, while the row or the button holds
       focus, or while its menu is open. Hidden with `display` so it takes no
       width until shown. A row's menu is mounted only where one of those can
       hold, see `menuRows` below. */
    "& [data-row-action]": {
      display: "none",
    },
    "&:hover [data-row-action], &:focus-within [data-row-action], & [data-row-action]:has([data-state=open])":
      {
        display: "flex",
      },
  },
  variants: {
    isSelected: {
      true: {
        backgroundColor: "blue.s30",
        _focus: {
          backgroundColor: "blue.s40",
        },
        "&:has([data-row-action] [data-state=open])": {
          backgroundColor: "blue.s40",
        },
      },
      false: {
        _hover: {
          backgroundColor: "neutral.bg.surface.hover",
        },
        "&:has([data-row-action] [data-state=open])": {
          backgroundColor: "neutral.bg.surface.hover",
        },
      },
    },
  },
});

const listItemContentStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flex: "[1]",
  minWidth: "[0]",
});

const listItemNameStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  fontSize: "sm",
  fontWeight: "medium",
  lineHeight: "snug",
  color: "neutral.s115",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  /* A parameter's row nests two lines, its name and its variable name; each
     truncates the same way a plain name does. */
  "& *": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const LIST_ITEM_ICON_SIZE = 12;
const LIST_ITEM_ICON_COLOR = "#9ca3af";

const listItemIconStyle = css({
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const chevronStyle = cva({
  base: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "[transform 150ms ease-out]",
    color: "neutral.s80",
  },
  variants: {
    expanded: {
      true: { transform: "rotate(90deg)" },
      false: { transform: "rotate(0deg)" },
    },
  },
});

const NESTING_INDENT = 16;

const emptyMessageStyle = css({
  pt: "1",
  px: "1",
  fontSize: "sm",
  color: "neutral.s65",
});

const parameterVarNameStyle = css({
  margin: "0",
  fontSize: "xs",
  color: "neutral.s85",
  fontFamily: "mono",
});

const entityIcons: Record<
  EntityItem["type"],
  ComponentType<{ size: number }>
> = {
  place: PlaceFilledIcon,
  transition: TransitionFilledIcon,
  type: TokenTypeIcon,
  differentialEquation: DifferentialEquationIcon,
  parameter: ParameterIcon,
};

const EntityIcon: React.FC<{ type: EntityItem["type"] }> = ({ type }) => {
  const TypeIcon = entityIcons[type];
  return <TypeIcon size={LIST_ITEM_ICON_SIZE} />;
};

const isGroup = (item: EntityTreeItem): item is EntityGroup =>
  "children" in item;

const selectionItemOf = ({ type, id }: EntityItem): SelectionItem => ({
  type,
  id,
});

const targetKey = (target: FocusStopTarget): string =>
  `${target.stopId}:${target.column}`;

/** The rows the keyboard flow walks, in document order; a collapsed group hides its children. */
const visibleRowsOf = (
  items: EntityTreeItem[],
  collapsedGroups: Set<string>,
): EntityTreeItem[] =>
  items.flatMap((item) =>
    isGroup(item) && !collapsedGroups.has(item.id)
      ? [item, ...item.children]
      : [item],
  );

/**
 * The entities of a net as a list of selectable rows under collapsible group
 * headers. Arrows walk the rows and select as they move, Shift extends a
 * range, and a row's menu or a header's action is one ArrowRight away.
 */
export const EntityList: React.FC<{ items: EntityTreeItem[] }> = ({
  items,
}) => {
  // By selector: every row of the list renders with this component.
  // `isSelected` is a new function when the selection changes.
  const checkIsSelected = useEditorState((editor) => editor.isSelected);
  const selectItem = useEditorState((editor) => editor.selectItem);
  const toggleItem = useEditorState((editor) => editor.toggleItem);
  const clearSelection = useEditorState((editor) => editor.clearSelection);
  const setSelection = useEditorState((editor) => editor.setSelection);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  // The Shift-range anchor: the item the last plain selection landed on.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  // The rows whose menu is mounted: the one last pointed at and the one last
  // focused, which are the only two that can show a menu. A menu is a few
  // dozen components that render again whenever the editor's state changes,
  // and a list has one row per item of the net.
  //
  // Neither is cleared when the pointer or focus leaves. An open menu draws
  // its items outside the row, and must outlive the pointer moving onto them.
  const [menuRows, setMenuRows] = useState<{
    pointed: string | null;
    focused: string | null;
  }>({ pointed: null, focused: null });
  const targets = useRef<Map<string, HTMLElement>>(new Map());

  const visibleRows = visibleRowsOf(items, collapsedGroups);
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
    focusTarget: (target) => focusLands(targets.current.get(targetKey(target))),
  });

  const registerTarget =
    (target: FocusStopTarget) => (element: HTMLElement | null) => {
      if (element) {
        targets.current.set(targetKey(target), element);
      } else {
        targets.current.delete(targetKey(target));
      }
    };

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (!next.delete(groupId)) {
        next.add(groupId);
      }
      return next;
    });
  };

  const select = (item: EntityItem) => {
    selectItem(selectionItemOf(item));
    setAnchorId(item.id);
  };

  const selectRange = (toId: string) => {
    const ids = visibleRows.map((row) => row.id);
    const toIndex = ids.indexOf(toId);
    if (toIndex === -1) {
      return;
    }
    const anchorIndex = anchorId === null ? -1 : ids.indexOf(anchorId);
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

  /** Arrows select as they move: apply the selection to the row that took focus. */
  const selectFocusedRow = (extendRange: boolean) => {
    const landed = visibleRows.find(
      (row) =>
        targets.current.get(targetKey({ stopId: row.id, column: 0 })) ===
        document.activeElement,
    );
    if (!landed || isGroup(landed)) {
      return;
    }
    if (extendRange) {
      selectRange(landed.id);
    } else {
      select(landed);
    }
  };

  const onRowKeyDown =
    (row: EntityTreeItem): React.KeyboardEventHandler =>
    (event) => {
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
        selectFocusedRow(event.shiftKey);
      }
    };

  const onRowClick = (event: React.MouseEvent, row: EntityTreeItem) => {
    event.stopPropagation();
    if (isGroup(row)) {
      toggleGroup(row.id);
    } else if (event.shiftKey && anchorId !== null) {
      selectRange(row.id);
    } else if (event.metaKey || event.ctrlKey) {
      toggleItem(selectionItemOf(row));
      setAnchorId(row.id);
    } else {
      select(row);
    }
  };

  const clear = () => {
    clearSelection();
    setAnchorId(null);
  };

  // A collapsed group's children stay mounted for the height animation; they
  // are out of `stops`, so `tabIndexFor` keeps them out of the tab order.
  const renderRow = (item: EntityTreeItem, depth: number) => {
    const group = isGroup(item);
    const selected = !group && checkIsSelected(item.id);
    const rowTarget: FocusStopTarget = { stopId: item.id, column: 0 };
    const actionTarget: FocusStopTarget = { stopId: item.id, column: 1 };
    const action = group ? (
      item.action ? (
        <item.action />
      ) : null
    ) : menuRows.pointed === item.id || menuRows.focused === item.id ? (
      <EntityRowMenu item={item} />
    ) : null;

    return (
      <div
        key={item.id}
        role="option"
        aria-selected={selected}
        ref={registerTarget(rowTarget)}
        tabIndex={tabIndexFor(rowTarget)}
        className={listItemRowStyle({ isSelected: selected })}
        style={
          depth > 0 ? { paddingLeft: depth * NESTING_INDENT + 4 } : undefined
        }
        onClick={(event) => onRowClick(event, item)}
        onKeyDown={onRowKeyDown(item)}
        onPointerEnter={() => {
          if (menuRows.pointed !== item.id) {
            setMenuRows({ ...menuRows, pointed: item.id });
          }
        }}
        onFocus={(event) => {
          // Focus bubbles, from the row's action button and from an open
          // menu's items as well.
          if (menuRows.focused !== item.id) {
            setMenuRows({ ...menuRows, focused: item.id });
          }
          // The row reports its own position, its action button reports
          // through the cell.
          if (event.target === event.currentTarget) {
            onFocusTarget(rowTarget);
          }
        }}
      >
        <div className={listItemContentStyle}>
          {group ? (
            <span
              className={chevronStyle({
                expanded: !collapsedGroups.has(item.id),
              })}
            >
              <Icon name="chevronRight" size="xxs" />
            </span>
          ) : (
            <span
              className={listItemIconStyle}
              style={{ color: item.iconColor ?? LIST_ITEM_ICON_COLOR }}
            >
              <EntityIcon type={item.type} />
            </span>
          )}
          <div className={listItemNameStyle}>
            {!group && item.variableName ? (
              <div>
                <div>{item.name}</div>
                <pre className={parameterVarNameStyle}>{item.variableName}</pre>
              </div>
            ) : (
              item.name
            )}
          </div>
        </div>
        {action ? (
          <RowActionCell
            registerButton={registerTarget(actionTarget)}
            onArrowKeyDown={onStopsKeyDown(actionTarget)}
            onButtonFocus={() => onFocusTarget(actionTarget)}
          >
            {action}
          </RowActionCell>
        ) : null}
      </div>
    );
  };

  return (
    <div
      ref={attach}
      className={listContainerStyle}
      role="listbox"
      aria-multiselectable="true"
      tabIndex={-1}
      onClick={clear}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          clear();
        }
      }}
    >
      {items.map((item) =>
        isGroup(item) ? (
          <Fragment key={item.id}>
            {renderRow(item, 0)}
            <div
              className={groupChildrenStyle}
              style={{ height: collapsedGroups.has(item.id) ? 0 : "auto" }}
            >
              {item.children.length > 0 ? (
                item.children.map((child) => renderRow(child, 1))
              ) : (
                <div
                  className={emptyMessageStyle}
                  style={{ paddingLeft: NESTING_INDENT + 4 }}
                >
                  {item.emptyGroupMessage}
                </div>
              )}
            </div>
          </Fragment>
        ) : (
          renderRow(item, 0)
        ),
      )}
    </div>
  );
};
