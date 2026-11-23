import { css, cx } from "@hashintel/ds-helpers/css";

import { bindOverlayScrollbars } from "./overlay-scroll-area/bind-overlay-scrollbars";

const rootStyle = css({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
  minWidth: "[0]",
  overflow: "hidden",
});
const viewportStyle = css({
  flex: "[1]",
  minHeight: "[0]",
  minWidth: "[0]",
  overflow: "auto",
  scrollbarWidth: "[none]",
  scrollbarGutter: "auto",
  "&::-webkit-scrollbar": { display: "none" },
});
// The padding is `scrollbarPadding` of `bind-overlay-scrollbars.ts`, which
// sizes the thumb to the track inside it.
const scrollbarStyle = css({
  position: "absolute",
  touchAction: "none",
  userSelect: "none",
  zIndex: "[4]",
  padding: "[2px]",
  opacity: "[0]",
  pointerEvents: "none",
  transition: "[opacity 120ms ease]",
  "&[data-hover], &[data-dragging]": { opacity: "[1]", pointerEvents: "auto" },
  "&[data-orientation=vertical]": {
    top: "[0]",
    bottom: "[0]",
    insetInlineEnd: "[0]",
    width: "[8px]",
  },
  "&[data-orientation=horizontal]": {
    bottom: "[0]",
    insetInlineStart: "[0]",
    insetInlineEnd: "[0]",
    height: "[8px]",
  },
  "&[data-orientation=vertical]:not([data-overflow-y]), &[data-orientation=horizontal]:not([data-overflow-x])":
    { display: "none" },
  "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
});
const thumbStyle = css({
  borderRadius: "full",
  backgroundColor: "neutral.a60",
  "&[data-orientation=horizontal]": { height: "[100%]" },
  "&[data-orientation=vertical]": { width: "[100%]" },
});

/**
 * A scroll area whose scrollbars lie over the content and show while the
 * pointer is over the area. The browser scrolls the viewport, and
 * `bindOverlayScrollbars` writes each thumb's size and place on the thumb.
 */
export const OverlayScrollArea: React.FC<{
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
}> = ({ children, className, viewportClassName }) => (
  <div
    ref={bindOverlayScrollbars}
    role="presentation"
    className={cx(rootStyle, className)}
  >
    <div
      role="presentation"
      data-part="viewport"
      tabIndex={-1}
      className={cx(viewportStyle, viewportClassName)}
    >
      <div role="presentation" style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
    <div
      data-part="scrollbar"
      data-orientation="vertical"
      className={scrollbarStyle}
    >
      <div data-orientation="vertical" className={thumbStyle} />
    </div>
    <div
      data-part="scrollbar"
      data-orientation="horizontal"
      className={scrollbarStyle}
    >
      <div data-orientation="horizontal" className={thumbStyle} />
    </div>
  </div>
);
