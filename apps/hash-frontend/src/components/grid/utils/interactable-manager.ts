import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import { typedKeys } from "@local/advanced-types/typed-entries";

import {
  CellPath,
  ColumnHeaderDrawArgs,
  ColumnHeaderPath,
  CursorPos,
  Interactable,
} from "./interactable-manager/types";
import {
  drawArgsToCellPath,
  drawArgsToColumnHeaderPath,
  isCursorOnInteractable,
  isPathCellPath,
  splitPath,
} from "./interactable-manager/utils";

class InteractableManagerClass {
  static instance: InteractableManagerClass | null = null;

  /**
   * @example A cell with single interactable element
   * ```ts
   * const interactableStore = {
   *  "users-1-2": { button1: { ...interactable } },
   * };
   * ```
   */
  private interactableStore: Record<
    CellPath | ColumnHeaderPath,
    Record<string, Interactable>
  > = {};

  getInteractable(path: CellPath | ColumnHeaderPath, id: string) {
    return Object.values(this.interactableStore[path] ?? {}).find(
      (interactable) => interactable.id === id,
    );
  }

  /**
   * @param args Draw args of cell
   * @param props Properties which will will be used to create the `Interactable`
   * @returns The created `Interactable`
   */
  createCellInteractable(
    args: DrawArgs<CustomCell>,
    props: Omit<Interactable, "hovered" | "path" | "cellRect">,
  ): Interactable {
    // used -100 to prevent handling events on non-hovered cells
    const { hoverX = -100, hoverY = -100, rect } = args;

    const hovered = isCursorOnInteractable(
      { posX: hoverX, posY: hoverY },
      props.pos,
      rect,
    );

    return {
      ...props,
      hovered,
      cellRect: rect,
      path: drawArgsToCellPath(args),
    };
  }

  /**
   * @param args Draw args of cell
   * @param props Properties which will will be used to create the `Interactable`
   * @returns The created `Interactable`
   */
  createColumnHeaderInteractable(
    args: ColumnHeaderDrawArgs,
    props: Omit<Interactable, "hovered" | "path" | "cellRect">,
  ): Interactable {
    const { rect, isHovered } = args;

    return {
      ...props,
      hovered: isHovered,
      cellRect: rect,
      path: drawArgsToColumnHeaderPath(args),
    };
  }

  /**
   * Call this function at the end of the `draw` function of the custom cell to register the interactables.
   * @param args Draw args of cell
   * @param interactables List of the interactables for a specific cell.
   */
  setInteractablesForCell(
    args: DrawArgs<CustomCell>,
    interactables: Interactable[],
  ) {
    const path = drawArgsToCellPath(args);

    /**
     * for each interactable, check if the hover status changed
     * if it's changed, trigger corresponding event
     */
    for (const interactable of interactables) {
      const existing = this.interactableStore[path]?.[interactable.id];

      if (existing && existing.hovered !== interactable.hovered) {
        const event = interactable.hovered
          ? interactable.onMouseEnter
          : interactable.onMouseLeave;

        event?.(interactable);
      }
    }

    const interactableMap = Object.fromEntries(
      interactables.map((interactable) => [interactable.id, interactable]),
    );

    this.interactableStore[path] = interactableMap;
  }

  /**
   * Call this function at the end of the `draw` function of the custom header to register the interactables.
   * @param args Draw args of column header
   * @param interactables List of the interactables for a specific column header.
   */
  setInteractablesForColumnHeader(
    args: ColumnHeaderDrawArgs,
    interactables: Interactable[],
  ) {
    const path = drawArgsToColumnHeaderPath(args);

    /** @todo: trigger on mouse enter/leave events? */

    const interactableMap = Object.fromEntries(
      interactables.map((interactable) => [interactable.id, interactable]),
    );

    this.interactableStore[path] = interactableMap;
  }

  /**
   * Checks if the cursor position is overlapping with an `Interactable` inside clicked cell.
   * If it's overlapping, triggers the corresponding event handler for the clicked `Interactable`
   * @returns true if handled the click event, false if not
   */
  handleClick(path: CellPath | ColumnHeaderPath, event: CursorPos): boolean {
    const interactableMap = this.interactableStore[path] ?? {};
    const interactables = Object.values(interactableMap);

    const foundInteractable = interactables.find(({ pos, cellRect }) =>
      isCursorOnInteractable(event, pos, cellRect),
    );

    if (!foundInteractable) {
      return false;
    }

    const { onClick, onMouseEnter } = foundInteractable;

    /**
     * if there is no onClick event defined, onMouseEnter works as onClick
     * since onMouseEnter is mostly used for showing tooltips, this will enable showing tooltips on mobile when on touch
     */
    const handler = onClick ?? onMouseEnter;

    if (handler) {
      handler(foundInteractable);

      return true;
    }

    return false;
  }

  /**
   * @param tableId Table to delete interactables
   * @param boundaries If it's defined, function will delete `Interactables` before and after the boundaries.
   * This is used to prevent memory bloat on tables with too many rows.
   * Using this we delete `Interactables` stored for non-visible rows while user scrolls through hundreds of rows
   */
  deleteInteractables(
    tableId: string,
    boundaries?: { deleteBeforeRow: number; deleteAfterRow: number },
  ) {
    const pathsToDelete = typedKeys(this.interactableStore).filter((path) => {
      if (path.startsWith(tableId) && isPathCellPath(path)) {
        if (!boundaries) {
          return true;
        }

        const { rowIndex } = splitPath(path);

        if (
          rowIndex < boundaries.deleteBeforeRow ||
          rowIndex > boundaries.deleteAfterRow
        ) {
          return true;
        }
      }

      return false;
    });

    for (const key of pathsToDelete) {
      delete this.interactableStore[key];
    }
  }
}

export const InteractableManager = new InteractableManagerClass();
Object.freeze(InteractableManager);
