import { CustomCell } from "@glideapps/glide-data-grid";
import type { DrawArgs } from "@glideapps/glide-data-grid/dist/ts/data-grid/cells/cell-types";
import {
  CellPath,
  CursorPos,
  Interactable,
} from "./interactable-manager/types";
import {
  drawArgsToPath,
  isCursorOnInteractable,
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
  private interactableStore: Record<CellPath, Record<string, Interactable>> =
    {};

  /**
   * @param args Draw args of cell
   * @param props Properties which will will be used to create the `Interactable`
   * @returns The created `Interactable`
   */
  create(
    args: DrawArgs<CustomCell>,
    props: Omit<Interactable, "hovered" | "path" | "cellRect">,
  ): Interactable {
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
      path: drawArgsToPath(args),
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
    const strPath = drawArgsToPath(args);

    const interactableMap = Object.fromEntries(
      interactables.map((interactable) => [interactable.id, interactable]),
    );

    /**
     * for each interactable, check if the hover status changed
     * if it's changed, trigger corresponding event
     */
    for (const interactable of interactables) {
      const existing = this.interactableStore[strPath]?.[interactable.id];

      if (existing && existing.hovered !== interactable.hovered) {
        const event = interactable.hovered
          ? interactable.onMouseEnter
          : interactable.onMouseLeave;

        event?.(interactable);
      }
    }

    this.interactableStore[strPath] = interactableMap;
  }

  /**
   * Checks if the cursor position is overlapping with an `Interactable` inside clicked cell.
   * If it's overlapping, triggers the corresponding event handler for the clicked `Interactable`
   * @returns true if handled the click event, false if not
   */
  handleClick(path: CellPath, event: CursorPos): boolean {
    const interactableMap = this.interactableStore[path] ?? {};
    const interactables = Object.values(interactableMap);

    let foundInteractable: Interactable | undefined;

    for (let i = 0; i < interactables.length; i++) {
      const interactable = interactables[i]!;
      const { pos, cellRect } = interactable;

      const hovered = isCursorOnInteractable(event, pos, cellRect);

      if (hovered) {
        foundInteractable = interactable;
      }
    }

    if (!foundInteractable) {
      return false;
    }

    const { onClick, onMouseEnter } = foundInteractable;

    const handler = onClick ?? onMouseEnter;

    if (handler) {
      handler?.(foundInteractable);

      return true;
    }

    return false;
  }
}

export const InteractableManager = new InteractableManagerClass();
Object.freeze(InteractableManager);
