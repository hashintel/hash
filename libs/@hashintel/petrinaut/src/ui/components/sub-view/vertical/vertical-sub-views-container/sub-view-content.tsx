import { useState } from "react";

import { useAvoidScrollWidthChange } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { useScrollOverflow } from "../../../../hooks/use-scroll-overflow";
import {
  MountsScrolledContext,
  useKeptScroll,
} from "../../../../lib/kept-state";

import type { SubView } from "../../types";

const sectionContentStyle = css({
  overflow: "hidden",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
});

const scrollContainerStyle = css({
  position: "relative",
  flex: "[1]",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
});

const panelContentStyle = css({
  overflowY: "auto",
  scrollbarWidth: "[thin]",
  flex: "[1]",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
  // No top padding on the scroll container — it would create a gap above
  // sticky section headers (which would pin below the gap). The first sticky
  // header owns its own top spacing. Bottom padding is fine: it scrolls with
  // the content, so short views keep a clean inset while overflowing views
  // scroll through the section's full height.
  "--subview-content-inline-padding": "[16px]",
  px: "[var(--subview-content-inline-padding)]",
  pb: "3",
  // The padding changes at once: a transition on it would resize the code
  // editor on every frame of a section's animation.
  "[data-subview-full-width-code] &": { paddingBottom: "0" },
});

const SHADOW_HEIGHT = 7;

const scrollShadowStyle = cva({
  base: {
    position: "absolute",
    left: "[0]",
    right: "[0]",
    height: `[${SHADOW_HEIGHT}px]`,
    pointerEvents: "none",
    zIndex: "[1]",
    opacity: "[0]",
    transition: "[opacity 150ms ease]",
  },
  variants: {
    position: {
      top: {
        top: "[0]",
        background: "[linear-gradient(to bottom, #D0D0D0, #FFFFFF10)]",
      },
      bottom: {
        bottom: "[0]",
        background: "[linear-gradient(to top, #D0D0D0, #FFFFFF10)]",
      },
    },
    visible: {
      true: { opacity: "[0.2]" },
    },
  },
});

/**
 * Wraps children in a scrollable container with top/bottom gradient shadows
 * that fade in when content overflows in that direction. The container keeps
 * its scroll offset under `scrollKey` while it is unmounted.
 */
const ScrollableContent: React.FC<{
  scrollKey: string;
  children: React.ReactNode;
}> = ({ scrollKey, children }) => {
  const { scrollRef, canScrollUp, canScrollDown, onScroll } =
    useScrollOverflow();
  useAvoidScrollWidthChange(scrollRef);
  const mountsScrolled = useKeptScroll(scrollRef, scrollKey);

  return (
    <div className={scrollContainerStyle}>
      <div
        className={scrollShadowStyle({
          position: "top",
          visible: canScrollUp,
        })}
      />
      <div ref={scrollRef} className={panelContentStyle} onScroll={onScroll}>
        <MountsScrolledContext value={mountsScrolled}>
          {children}
        </MountsScrolledContext>
      </div>
      <div
        className={scrollShadowStyle({
          position: "bottom",
          visible: canScrollDown,
        })}
      />
    </div>
  );
};

export const SubViewContent: React.FC<{
  subView: SubView;
  visible: boolean;
}> = ({ subView, visible }) => {
  const [visited, setVisited] = useState(visible);
  if (visible && !visited) setVisited(true);
  if (!visible && !(subView.retainOnCollapse && visited)) return null;
  const Component = subView.component;

  return (
    <div
      id={`subview-content-${subView.id}`}
      className={sectionContentStyle}
      style={visible ? undefined : { display: "none" }}
      inert={!visible}
      aria-hidden={!visible || undefined}
    >
      <ScrollableContent scrollKey={`scroll:${subView.id}`}>
        <Component />
      </ScrollableContent>
    </div>
  );
};
