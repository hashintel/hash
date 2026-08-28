/**
 * Membership in the enclosing `FocusStack`, for units that are not grids: a
 * single focusable element (a collapsible header, a lone cell) or a custom
 * navigator that owns its internal movement and only delegates edge moves.
 */

import { use, useEffect, useId, useState } from "react";

import {
  FocusGroupContext,
  focusLands,
  type FocusDirection,
  type FocusEntry,
} from "./focus-flow";

export interface FocusMember {
  /** Attach to the member's root element; registered while mounted. */
  attach: (element: HTMLElement | null) => void;
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
    moveFrom: (direction, from) => group.moveFrom(id, direction, from),
  };
}

export interface FocusHeader {
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
 * A single-element member for a section or place header. Left/Right drive
 * its collapse state when handlers are given — a header that owns
 * horizontal keys never emits horizontal moves.
 */
export function useFocusHeader(options: {
  collapse?: () => void;
  expand?: () => void;
}): FocusHeader {
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
