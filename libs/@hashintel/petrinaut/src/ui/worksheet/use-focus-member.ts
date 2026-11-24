/**
 * Membership in the enclosing `FocusStack`. Grids, stop tables and nested
 * stacks register through it, and so does a unit with no hook of its own: a
 * single focusable element (a collapsible header, a lone cell) or a custom
 * navigator that owns its internal movement and only delegates edge moves.
 */

import { use, useEffect, useId, useState } from "react";

import {
  FocusGroupContext,
  focusLands,
  type FocusDirection,
  type FocusEntry,
  type FocusFold,
} from "./focus-flow";

interface FocusMember {
  /** Attach to the member's root element; registered while mounted. */
  attach: (element: HTMLElement | null) => void;
  /** The attached element, for a member that listens on its own root. */
  element: HTMLElement | null;
  /** Carry focus out of this member. Returns whether focus moved. */
  moveFrom: (
    direction: FocusDirection,
    from?: { row: number; column: number },
  ) => boolean;
}

/** Registers one member entered through `enter`. */
export function useFocusMember(
  enter: (entry: FocusEntry) => boolean,
): FocusMember {
  const group = use(FocusGroupContext);
  const id = useId();
  const [element, setElement] = useState<HTMLElement | null>(null);

  // Re-register every render for a fresh `enter` closure; unregister only
  // on unmount or a group change, so the group's memory of this member
  // survives ordinary renders.
  useEffect(() => {
    if (element) {
      group.register(id, { element, enter });
    }
  });
  useEffect(() => () => group.unregister(id), [group, id]);

  return {
    attach: setElement,
    element,
    moveFrom: (direction, from) => group.moveFrom(id, direction, from),
  };
}

interface FocusHeader {
  /** Attach to the header's focusable trigger. */
  attach: (element: HTMLButtonElement | null) => void;
  /**
   * Arrow handling for the trigger: vertical moves leave to the
   * neighbouring member; Left/Right collapse/expand when handlers are
   * given, and otherwise leave horizontally.
   */
  onHeaderKeyDown: React.KeyboardEventHandler;
}

/**
 * A single-element member for a section or place header. Left/Right fold it
 * as `FocusFold` says; the arrow with no handler leaves horizontally.
 */
export function useFocusHeader(options: FocusFold): FocusHeader {
  const [element, setElement] = useState<HTMLButtonElement | null>(null);
  const member = useFocusMember(() => focusLands(element));

  const onHeaderKeyDown: React.KeyboardEventHandler = (event) => {
    const handled = (action: () => unknown) => {
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    if (event.key === "ArrowUp") {
      handled(() => member.moveFrom("up"));
    } else if (event.key === "ArrowDown") {
      handled(() => member.moveFrom("down"));
    } else if (event.key === "ArrowLeft") {
      handled(options.collapse ?? (() => member.moveFrom("left")));
    } else if (event.key === "ArrowRight") {
      handled(options.expand ?? (() => member.moveFrom("right")));
    }
  };

  const attach = (target: HTMLButtonElement | null) => {
    setElement(target);
    member.attach(target);
  };

  return { attach, onHeaderKeyDown };
}
