/**
 * @layerRoot ui.views.editor.drawer-frame
 * @role The chrome every Simulate drawer and the full study view share: a header that condenses once the body scrolls, a body of fixed-height cards, a footer of actions
 *
 * The header sits outside the body's scroll container, so condensing it
 * changes the body's available height and never its scroll offset. The body
 * is a size container: a `note` row always mounted in the body's top
 * padding, empty when there is nothing to say, so an error or a resume note
 * appearing moves nothing; then the adopter's parameter card across the
 * width, then `FrameColumns`, which
 * arranges the surface and the cards by the body's width. In a drawer the
 * body takes the opening focus, so wheel and arrow keys scroll it at once and
 * no control in the header holds the header open. One switch, the animations
 * setting and the reduced-motion preference together, governs every
 * transition in the frame: the header and the body read it from context,
 * and the body stamps it as `data-animate` for the cards' styles.
 */
import { type ReactNode, use, useRef } from "react";

import { Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { UserSettingsContext } from "../../../../../../../react/state/user-settings-context";
import { usePrefersReducedMotion } from "../use-prefers-reduced-motion";
import { FrameAnimateContext } from "./frame-animate-context";
import {
  FRAME_HEADER_CONDENSED_HEIGHT,
  FRAME_HEADER_HEIGHT,
  FrameHeader,
} from "./frame-header";
import { useBodyScrolled } from "./use-body-scrolled";
import { useHeaderEngaged } from "./use-header-engaged";

/** The reserved row under the header: a note in the muted or the error tone. */
export type FrameNote = {
  /** One line; it is also the row's tooltip when the line clips. */
  content: string;
  tone: "muted" | "error";
};

/** The height of the note row in pixels: the body's top padding, which the row sits in. */
const FRAME_NOTE_HEIGHT = 20;

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

// Two groups, one pinned to each edge, so a control that stays across a
// status change never moves as its neighbours mount and unmount.
const sectionFooterStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  flexShrink: "0",
  paddingX: "5",
  paddingY: "3",
  borderTopWidth: "[1px]",
  borderTopStyle: "solid",
  borderTopColor: "neutral.s40",
});

const sectionFooterGroupStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  minWidth: "[0]",
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

// The body is a tinted ground the white cards sit on. Its top padding is
// the note row's home, so the first card sits one gap under the header.
const bodyStyle = css({
  position: "relative",
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
  paddingTop: "5",
  paddingBottom: "4",
  backgroundColor: "neutral.s05",
  containerType: "inline-size",
  containerName: "drawer-frame-body",
});

// In the body's top padding, scrolling with the content.
const noteRowStyle = css({
  position: "absolute",
  top: "[0]",
  left: "5",
  right: "5",
  display: "flex",
  alignItems: "center",
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
  /** One line: `SIR transmission sweep · Seasonal Flu · 100 runs`. */
  title: string;
  /** Before the title: a Back button in the full view. */
  leading?: ReactNode;
  /** The title line's right side while at rest: the study's progress line. */
  headline?: ReactNode | null;
  /** The stat columns: `FrameStat`s holding the status pill, the counts, the computing chip. */
  stats: ReactNode;
  /** The strip's last column, pinned right: the compute badge. */
  badge?: ReactNode | null;
  /** The bar along the header's bottom edge, 0 to 100. */
  progress: number;
  /** The row in the body's top padding; null keeps the row empty. */
  note?: FrameNote | null;
  /** The footer's actions, pinned to its right edge. */
  footer: ReactNode;
  /** The footer's left side: the controls that stay whatever the status. */
  footerSecondary?: ReactNode | null;
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
  footerSecondary = null,
  drawer,
  children,
}: DrawerFrameProps) => {
  const { showAnimations } = use(UserSettingsContext);
  const reducedMotion = usePrefersReducedMotion();
  const { scrolled, onScroll } = useBodyScrolled(
    FRAME_HEADER_HEIGHT - FRAME_HEADER_CONDENSED_HEIGHT,
  );
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
      closeGutter={drawer === undefined ? 0 : DRAWER_CLOSE_GUTTER}
      engagement={engagement}
    />
  );

  const body = (
    <div
      ref={bodyRef}
      className={bodyStyle}
      data-frame-body
      data-animate={animate}
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
        title={note?.content}
      >
        {note?.content}
      </div>
      {children}
    </div>
  );

  if (drawer === undefined) {
    return (
      <FrameAnimateContext value={animate}>
        <div className={sectionFrameStyle} data-drawer-frame>
          <div className={sectionHeaderStyle}>{header}</div>
          {body}
          <div className={sectionFooterStyle}>
            <div className={sectionFooterGroupStyle}>{footerSecondary}</div>
            <div className={sectionFooterGroupStyle}>{footer}</div>
          </div>
        </div>
      </FrameAnimateContext>
    );
  }

  return (
    <FrameAnimateContext value={animate}>
      <Drawer
        size="xl"
        showBackdrop={false}
        onClose={drawer.onClose}
        swapKey={drawer.swapKey}
        initialFocusRef={bodyRef}
        // The header holds no ds Title, so the dialog takes its name from here.
        aria-label={title}
      >
        <Drawer.Header className={drawerHeaderStyle}>{header}</Drawer.Header>
        <Drawer.Body withPadding={false} className={drawerBodyStyle}>
          {body}
        </Drawer.Body>
        <Drawer.Footer
          secondaryActions={footerSecondary}
          actions={footer ?? null}
        />
      </Drawer>
    </FrameAnimateContext>
  );
};
