import {
  type CSSProperties,
  use,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { BottomBarCollapseContext } from "./collapse-context";

/**
 * The content stays at its natural width while its container animates. Measuring
 * both keeps the fully expanded bar width stable throughout the animation.
 *
 * The reveal is a selector on the bar rather than state passed back down: the
 * browser maintains `:hover` and `:focus-within` itself, where mirroring them
 * into React can strand the bar open — a control that unmounts while focused
 * fires no blur.
 *
 * A menu opened from the bar renders in a portal outside it, taking the
 * pointer and the focus with it, so the third selector holds the bar open
 * while a control inside it reports one. The same pattern keeps the sidebar's
 * row actions up; see `filterable-list-sub-view`.
 */
const groupStyle = cva({
  base: {
    width: "[var(--group-width, max-content)]",
    flexShrink: 0,
    transition:
      "[width 140ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 100ms ease-out]",
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
  variants: {
    animateEntry: {
      true: {
        "@starting-style": { width: "[0px]", opacity: "[0]" },
      },
    },
    collapsed: {
      true: {
        width: "[0px]",
        opacity: "[0]",
        pointerEvents: "none",
        // Keep the selector on one line: Panda includes it in the class name.
        '[data-bottom-bar]:hover &, [data-bottom-bar]:focus-within &, [data-bottom-bar]:has([data-state="open"]) &':
          {
            width: "[var(--group-width, max-content)]",
            opacity: "[1]",
            pointerEvents: "auto",
          },
      },
    },
  },
});

const clipStyle = css({
  overflow: "hidden",
  minWidth: "[0]",
});

const contentStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  width: "[max-content]",
});

/**
 * Toolbar controls the bottom bar hides when it runs out of room, and shows
 * again while the pointer or the keyboard is on the bar.
 *
 * A folded group keeps its controls focusable on purpose: focus is what
 * reveals them, so making the subtree inert would leave a keyboard with no way
 * in.
 */
export const CollapsibleGroup: React.FC<{
  children: React.ReactNode;
  animateEntry?: boolean;
}> = ({ children, animateEntry = false }) => {
  const { isCollapsed, reportGroupWidth } = use(BottomBarCollapseContext);
  const groupId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [naturalWidth, setNaturalWidth] = useState<number | undefined>(
    animateEntry ? 0 : undefined,
  );

  useLayoutEffect(() => {
    const group = groupRef.current;
    const content = contentRef.current;
    if (!group || !content) {
      return;
    }

    const measure = () => {
      const natural = content.getBoundingClientRect().width;
      const rendered = group.getBoundingClientRect().width;
      setNaturalWidth(natural);
      reportGroupWidth(groupId, { natural, rendered });
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(group);
    observer.observe(content);

    return () => {
      observer.disconnect();
      reportGroupWidth(groupId, null);
    };
  }, [groupId, reportGroupWidth]);

  return (
    <div
      ref={groupRef}
      className={groupStyle({ collapsed: isCollapsed, animateEntry })}
      style={
        {
          "--group-width":
            naturalWidth === undefined ? undefined : `${naturalWidth}px`,
        } as CSSProperties
      }
    >
      <div className={clipStyle}>
        <div ref={contentRef} className={contentStyle}>
          {children}
        </div>
      </div>
    </div>
  );
};
