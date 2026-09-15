import { ScrollArea } from "@ark-ui/react/scroll-area";

import { css, cx } from "@hashintel/ds-helpers/css";

const rootStyle = css({
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
  scrollbarWidth: "[none]",
  scrollbarGutter: "auto",
  "&::-webkit-scrollbar": { display: "none" },
});
const scrollbarStyle = css({
  zIndex: "[4]",
  padding: "[2px]",
  opacity: "[0]",
  pointerEvents: "none",
  transition: "[opacity 120ms ease]",
  "&[data-hover], &[data-dragging]": { opacity: "[1]", pointerEvents: "auto" },
  "&[data-orientation=vertical]": { width: "[8px]" },
  "&[data-orientation=horizontal]": { height: "[8px]" },
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

export const overlayScrollDrawerBodyStyle = css({
  display: "flex",
  overflow: "hidden",
});
export const overlayScrollDrawerViewportStyle = css({
  paddingX: "[var(--panel-horizontal-padding)]",
  paddingBottom: "5",
});

export const OverlayScrollArea: React.FC<{
  children: React.ReactNode;
  className?: string;
  viewportClassName?: string;
}> = ({ children, className, viewportClassName }) => (
  <ScrollArea.Root className={cx(rootStyle, className)}>
    <ScrollArea.Viewport
      tabIndex={-1}
      className={cx(viewportStyle, viewportClassName)}
    >
      <ScrollArea.Content style={{ minWidth: 0 }}>
        {children}
      </ScrollArea.Content>
    </ScrollArea.Viewport>
    <ScrollArea.Scrollbar orientation="vertical" className={scrollbarStyle}>
      <ScrollArea.Thumb className={thumbStyle} />
    </ScrollArea.Scrollbar>
    <ScrollArea.Scrollbar orientation="horizontal" className={scrollbarStyle}>
      <ScrollArea.Thumb className={thumbStyle} />
    </ScrollArea.Scrollbar>
  </ScrollArea.Root>
);
