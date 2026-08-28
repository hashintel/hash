/**
 * @layerRoot ui.worksheet
 * @role Reusable keyboard flow and interaction grammar for worksheets — panels composed of spreadsheet grids and ordinary controls
 *
 * `FocusStack`: a nestable directional group in the worksheet's keyboard
 * flow. It renders `display: contents`, so it adds no box and no role — the
 * layout stays the host's — and coordinates its children: an arrow move
 * that runs off a child's edge along the stack's axis carries focus to the
 * neighbouring child, entering it at its remembered position (focusgroup
 * semantics, the default) or aligned with the position the move left from
 * (`entry="aligned"`). Cross-axis moves, and moves off the stack's own
 * edge, forward to the enclosing stack — unless `contain` fences the walk.
 *
 * Tab order is untouched throughout: every grid stays its own tab stop and
 * plain controls keep theirs. Arrow-crossing between siblings is an
 * enhancement over that intact order, never a replacement.
 *
 * `FocusRoot` bounds a flow: moves that escape the outermost stack stop
 * there. Stacks used without a root behave the same (the default group
 * refuses every move), so the root is documentation more than mechanism.
 */

import { use, useEffect, useId, useRef, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import {
  BOUNDARY_FOCUS_GROUP,
  focusAxisOf,
  FocusGroupContext,
  focusForward,
  type FocusAxis,
  type FocusEntry,
  type FocusGroup,
  type FocusMemberHandle,
} from "./focus-flow";

import type { ReactNode } from "react";

const contentsStyle = css({ display: "contents" });

export interface FocusStackProps {
  axis: FocusAxis;
  /** Arrows never carry focus out of this stack, in any direction. */
  contain?: boolean;
  /**
   * Where a move arriving from a sibling lands inside a child: the child's
   * remembered position ("remembered", the default — focusgroup semantics),
   * or aligned with the position the move left from ("aligned" — a
   * horizontal move keeps its row, a vertical one its column).
   */
  entry?: "remembered" | "aligned";
  children: ReactNode;
}

/**
 * One directional group. Children register through context — grids and
 * headers via their hooks, nested stacks automatically.
 */
export const FocusStack: React.FC<FocusStackProps> = ({
  axis,
  contain = false,
  entry = "remembered",
  children,
}) => {
  const parent = use(FocusGroupContext);
  const id = useId();
  const membersRef = useRef(new Map<string, FocusMemberHandle>());
  // The child focus last landed in, restored when a move re-enters the
  // stack. Updated from focusin (covering pointer clicks too) and read only
  // in event handlers; invalid ids fall back to edge entry.
  const lastChildRef = useRef<string | null>(null);
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  const orderedMembers = (): { id: string; handle: FocusMemberHandle }[] =>
    [...membersRef.current.entries()]
      .map(([memberId, handle]) => ({ id: memberId, handle }))
      .sort((a, b) =>
        // eslint-disable-next-line no-bitwise -- compareDocumentPosition returns a bitmask
        a.handle.element.compareDocumentPosition(b.handle.element) &
        Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );

  /**
   * `applyPolicy` marks the stack that routes a move: it decides between
   * remembered and aligned entry. Stacks the entry then passes through
   * hand it on unchanged, so one `entry="aligned"` at the routing level is
   * enough.
   */
  const enterChild = (
    memberId: string,
    entering: FocusEntry,
    applyPolicy: boolean,
  ): boolean => {
    const handle = membersRef.current.get(memberId);
    if (!handle) {
      return false;
    }
    const resolved =
      applyPolicy && entry !== "aligned"
        ? { direction: entering.direction }
        : entering;
    const landed = handle.enter(resolved);
    if (landed) {
      lastChildRef.current = memberId;
    }
    return landed;
  };

  /** Enter this stack as a whole: its remembered child, else edge-first.
   * The routing ancestor already applied its entry policy — pass through:
   * an aligned `from` still picks the remembered child (child choice has no
   * geometry to align with), and aligns the position inside it. */
  const enterStack = (entering: FocusEntry): boolean => {
    {
      const remembered = lastChildRef.current;
      if (remembered && enterChild(remembered, entering, false)) {
        return true;
      }
    }
    const ordered = orderedMembers();
    const walk = focusForward(entering.direction) ? ordered : ordered.reverse();
    return walk.some((member) => enterChild(member.id, entering, false));
  };

  const group: FocusGroup = {
    register: (memberId, handle) => {
      membersRef.current.set(memberId, handle);
    },
    unregister: (memberId) => {
      membersRef.current.delete(memberId);
      if (lastChildRef.current === memberId) {
        lastChildRef.current = null;
      }
    },
    moveFrom: (memberId, direction, from) => {
      if (focusAxisOf(direction) === axis) {
        const ordered = orderedMembers();
        const start = ordered.findIndex((member) => member.id === memberId);
        if (start !== -1) {
          const step = focusForward(direction) ? 1 : -1;
          for (
            let index = start + step;
            index >= 0 && index < ordered.length;
            index += step
          ) {
            if (enterChild(ordered[index]!.id, { direction, from }, true)) {
              return true;
            }
          }
        }
      }
      if (contain) {
        return false;
      }
      return parent.moveFrom(id, direction, from);
    },
  };
  // A stable identity for the context value would drop every keystroke's
  // closure; the compiler memoizes it against its real inputs.

  // Re-register every render so the parent always holds the freshest enter
  // closure; unregister only on unmount (or a parent change), so the
  // parent's memory of this child survives ordinary renders.
  useEffect(() => {
    if (element) {
      parent.register(id, { element, enter: enterStack });
    }
  });
  useEffect(() => () => parent.unregister(id), [parent, id]);

  return (
    <FocusGroupContext value={group}>
      <div
        ref={setElement}
        className={contentsStyle}
        role="presentation"
        data-focus-stack={axis}
        onFocus={(event) => {
          // Track which child holds focus, so re-entry restores it. focusin
          // bubbles through display:contents wrappers.
          if (!(event.target instanceof Node)) {
            return;
          }
          for (const [memberId, handle] of membersRef.current) {
            if (handle.element.contains(event.target)) {
              lastChildRef.current = memberId;
              return;
            }
          }
        }}
      >
        {children}
      </div>
    </FocusGroupContext>
  );
};

export interface FocusRootProps {
  children: ReactNode;
}

/**
 * The boundary of a keyboard flow: moves escaping the outermost stack stop
 * here, and stacks inside never route into surrounding UI.
 */
export const FocusRoot: React.FC<FocusRootProps> = ({ children }) => (
  <FocusGroupContext value={BOUNDARY_FOCUS_GROUP}>{children}</FocusGroupContext>
);
