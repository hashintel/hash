import { use, useId, useLayoutEffect, useRef } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { BottomBarCollapseContext } from "./collapse-context";

/**
 * The group folds by animating its grid column to nothing while the content
 * inside keeps its natural width. That keeps the content measurable whether it
 * is shown or hidden, so the bar can tell how wide it would be with everything
 * shown without laying the controls out twice.
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
    display: "grid",
    gridTemplateColumns: "[1fr]",
    transition: "[grid-template-columns 160ms ease-in, opacity 160ms ease-in]",
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
  variants: {
    collapsed: {
      true: {
        gridTemplateColumns: "[0fr]",
        opacity: "[0]",
        pointerEvents: "none",
        // Revealing answers the pointer, so it runs shorter and decelerates;
        // folding is not a response to anything and eases in. The selector
        // stays on one line: Panda writes the key into the class name, and a
        // wrapped one stops matching the rule it generated.
        '[data-bottom-bar]:hover &, [data-bottom-bar]:focus-within &, [data-bottom-bar]:has([data-state="open"]) &':
          {
            gridTemplateColumns: "[1fr]",
            opacity: "[1]",
            pointerEvents: "auto",
            transition:
              "[grid-template-columns 120ms ease-out, opacity 120ms ease-out]",
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
export const CollapsibleGroup: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isCollapsed, reportGroupWidth } = use(BottomBarCollapseContext);
  const groupId = useId();
  const clipRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const clip = clipRef.current;
    const content = contentRef.current;
    if (!clip || !content) {
      return;
    }

    const measure = () => {
      const natural = content.getBoundingClientRect().width;
      const rendered = clip.getBoundingClientRect().width;
      reportGroupWidth(groupId, {
        natural,
        hidden: Math.max(natural - rendered, 0),
      });
    };
    measure();

    // Both boxes are watched: the content changes when a control appears, and
    // the clip changes on every frame of the fold. Reporting the pair from one
    // observer keeps the two in step, so the width the bar derives from them
    // is right mid-animation too.
    const observer = new ResizeObserver(measure);
    observer.observe(clip);
    observer.observe(content);

    return () => {
      observer.disconnect();
      reportGroupWidth(groupId, null);
    };
  }, [groupId, reportGroupWidth]);

  return (
    <div className={groupStyle({ collapsed: isCollapsed })}>
      <div ref={clipRef} className={clipStyle}>
        <div ref={contentRef} className={contentStyle}>
          {children}
        </div>
      </div>
    </div>
  );
};
