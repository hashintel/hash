import { use, useId, useLayoutEffect, useRef } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { BottomBarCollapseContext } from "./collapse-context";

/**
 * The group collapses by animating its grid column to nothing while the
 * content inside keeps its natural width. That keeps the content measurable
 * whether it is shown or hidden, so the bar can tell how wide it would be with
 * everything shown without laying the controls out twice.
 */
const groupStyle = cva({
  base: {
    display: "grid",
    gridTemplateColumns: "[1fr]",
    transition:
      "[grid-template-columns 150ms ease-in-out, opacity 150ms ease-in-out]",
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
    // the clip changes on every frame of the collapse. Reporting the pair from
    // one observer keeps the two in step, so the width the bar derives from
    // them is right mid-animation too.
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
