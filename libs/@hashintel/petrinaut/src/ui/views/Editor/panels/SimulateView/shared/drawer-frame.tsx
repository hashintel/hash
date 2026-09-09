/**
 * @layerRoot ui.views.editor.drawer-frame
 * @role The chrome every Simulate drawer and the full study view share: a header that condenses once the body scrolls, a body of fixed-height cards, a footer of actions
 *
 * The header sits outside the body's scroll container, so condensing it
 * changes the body's available height and never its scroll offset. The body
 * is a size container: a `note` row always mounted, empty when there is
 * nothing to say, so an error or a resume note appearing moves nothing; then
 * the adopter's parameter card across the width, then `FrameColumns`, which
 * arranges the surface and the cards by the body's width. In a drawer the
 * body takes the opening focus, so wheel and arrow keys scroll it at once and
 * no control in the header holds the header open.
 */
import { type ReactNode, use, useRef } from "react";

import { Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { FrameAnimateContext } from "./drawer-frame/frame-animate-context";
import { FrameHeader } from "./drawer-frame/frame-header";
import { useBodyScrolled } from "./drawer-frame/use-body-scrolled";
import { useHeaderEngaged } from "./drawer-frame/use-header-engaged";
import { usePrefersReducedMotion } from "./drawer-frame/use-prefers-reduced-motion";

export {
  FRAME_HEADER_CONDENSED_HEIGHT,
  FRAME_HEADER_HEIGHT,
  FrameStat,
  FrameStatusPill,
  type FrameStatusTone,
} from "./drawer-frame/frame-header";
export {
  FRAME_SECONDARY_MIN_WIDTH,
  FRAME_TWO_COLUMN_MIN_WIDTH,
  FrameColumns,
} from "./drawer-frame/frame-columns";
export { FrameBand } from "./drawer-frame/frame-band";
export { FrameCard, type FrameCardMore } from "./drawer-frame/frame-card";
export {
  type FrameLayoutSignature,
  frameLayoutSignature,
} from "./drawer-frame/frame-layout-signature";
export {
  type ComputeBatch,
  ComputeBatchesChip,
} from "./drawer-frame/compute-batches-chip";

/** The reserved row under the header: a note in the muted or the error tone. */
export type FrameNote = {
  content: ReactNode;
  tone: "muted" | "error";
};

/** The height of the note row in pixels; reserved whether or not a note shows. */
export const FRAME_NOTE_HEIGHT = 20;

// The ds close button is 28px wide with a 20px right gutter.
const DRAWER_CLOSE_GUTTER = 52;

const sectionFrameStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "1",
  minWidth: "[0]",
  minHeight: "[0]",
  height: "full",
  backgroundColor: "neutral.s00",
});

// The frame header's progress bar is the section header's bottom edge.
const sectionHeaderStyle = css({
  flexShrink: "0",
});

const sectionFooterStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "2",
  flexShrink: "0",
  paddingX: "5",
  paddingY: "3",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.s40",
});

// The ds header's own padding and bottom rule go; the frame header brings
// its own padding and its progress bar is the bottom edge. The close button
// the ds header draws floats over the frame header's right gutter.
const drawerHeaderStyle = css({
  display: "block",
  padding: "[0 !important]",
  borderBottomWidth: "[0 !important]",
  position: "relative",
  "& > div:first-child": { minWidth: "[0]" },
  "& > button": {
    position: "absolute",
    top: "[4px]",
    right: "[20px]",
    margin: "[0]",
  },
});

const drawerBodyStyle = css({
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
});

// The body is a tinted ground the white cards sit on.
const bodyStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "4",
  flex: "[1]",
  minHeight: "[0]",
  minWidth: "[0]",
  overflowY: "auto",
  overflowX: "hidden",
  outline: "none",
  scrollbarWidth: "[thin]",
  scrollbarGutter: "stable",
  paddingX: "5",
  paddingBottom: "4",
  backgroundColor: "neutral.s05",
  containerType: "inline-size",
  containerName: "drawer-frame-body",
});

const noteRowStyle = css({
  display: "flex",
  alignItems: "center",
  flexShrink: "0",
  minWidth: "[0]",
  fontSize: "xs",
  lineHeight: "[16px]",
  color: "neutral.s80",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  "&[data-tone=error]": { color: "red.s100" },
});

export type DrawerFrameProps = {
  /** One line: `SIR transmission sweep · Seasonal Flu · 100 runs · dt 1`. */
  title: string;
  /** Before the title: a Back button in the full view. */
  leading?: ReactNode;
  /** The title line's right side while at rest: the study's progress line. */
  headline?: ReactNode;
  /** The stat columns: `FrameStat`s holding the status pill, the counts, the computing chip. */
  stats: ReactNode;
  /** The strip's last column, pinned right: the compute badge. */
  badge?: ReactNode;
  /** The bar along the header's bottom edge, 0 to 100. */
  progress: number;
  /** The reserved row at the top of the body; null keeps the row empty. */
  note?: FrameNote | null;
  /** The footer's actions. */
  footer: ReactNode;
  /** Given, the frame renders inside a ds `Drawer`; otherwise it fills its section. */
  drawer?: { onClose: () => void; swapKey: string };
  children: ReactNode;
};

export const DrawerFrame = ({
  title,
  leading,
  headline,
  stats,
  badge,
  progress,
  note = null,
  footer,
  drawer,
  children,
}: DrawerFrameProps) => {
  const { showAnimations } = use(UserSettingsContext);
  const reducedMotion = usePrefersReducedMotion();
  const { scrolled, onScroll } = useBodyScrolled();
  const { engaged, engagement, settleFocus } = useHeaderEngaged();
  const bodyRef = useRef<HTMLDivElement>(null);
  const condensed = scrolled && !engaged;
  const animate = showAnimations && !reducedMotion;

  const header = (
    <FrameHeader
      title={title}
      leading={leading}
      headline={headline}
      stats={stats}
      badge={badge}
      progress={progress}
      condensed={condensed}
      animate={animate}
      closeGutter={drawer === undefined ? 0 : DRAWER_CLOSE_GUTTER}
      engagement={engagement}
    />
  );

  const body = (
    <div
      ref={bodyRef}
      className={bodyStyle}
      data-frame-body
      tabIndex={-1}
      onScroll={(event) => {
        onScroll(event);
        settleFocus();
      }}
    >
      <div
        className={noteRowStyle}
        data-frame-note
        data-tone={note?.tone ?? "muted"}
        style={{ height: FRAME_NOTE_HEIGHT }}
        title={typeof note?.content === "string" ? note.content : undefined}
      >
        {note?.content}
      </div>
      <FrameAnimateContext value={animate}>{children}</FrameAnimateContext>
    </div>
  );

  if (drawer === undefined) {
    return (
      <div className={sectionFrameStyle} data-drawer-frame>
        <div className={sectionHeaderStyle}>{header}</div>
        {body}
        <div className={sectionFooterStyle}>{footer}</div>
      </div>
    );
  }

  return (
    <Drawer
      size="xl"
      showBackdrop={false}
      onClose={drawer.onClose}
      swapKey={drawer.swapKey}
      initialFocusRef={bodyRef}
    >
      <Drawer.Header className={drawerHeaderStyle}>{header}</Drawer.Header>
      <Drawer.Body withPadding={false} className={drawerBodyStyle}>
        {body}
      </Drawer.Body>
      <Drawer.Footer actions={footer ?? null} />
    </Drawer>
  );
};
