/**
 * The HASH app shell around every Flows page: the real app's left sidebar (hash-frontend `PageSidebar`), seeded.
 * The workspace switcher sits at the top with the close arrow, then the nav: Home, Inbox, Flows (with its own pages
 * open under it on every Flows route), Entities and Types. The account sits at the bottom.
 *
 * On the list pages (`/flows`, `/flows/triggers`, `/runs`) the sidebar is open beside the page; its arrow closes it
 * to the 42 px strip and the strip's arrow opens it again (remembered). In the editor, History and a run it is always
 * the strip, and the arrow opens the sidebar over the page; Esc or a click outside closes it.
 */
import {
  Asterisk,
  House,
  Inbox,
  type LucideIcon,
  Shapes,
  Zap,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Avatar, Button, Icon, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import workspaceAvatar from "./assets/workspace-avatar.png";
import { navigate, type Route, useLocation } from "./router";
import { iconStroke } from "./thin-icons";

export const sidebarWidth = 260;

const collapsedKey = "flows-proto:sidebar:v1";
const collapsedEvent = "flows-proto:sidebar";

const readCollapsed = () => {
  try {
    return globalThis.localStorage.getItem(collapsedKey) === "closed";
  } catch {
    return false;
  }
};

const setCollapsed = (collapsed: boolean) => {
  try {
    globalThis.localStorage.setItem(
      collapsedKey,
      collapsed ? "closed" : "open",
    );
  } catch {
    // Private windows: the sidebar still opens and closes, it just isn't remembered.
  }
  globalThis.dispatchEvent(new Event(collapsedEvent));
};

const subscribeCollapsed = (onChange: () => void) => {
  globalThis.addEventListener(collapsedEvent, onChange);
  return () => globalThis.removeEventListener(collapsedEvent, onChange);
};

const useCollapsed = () =>
  useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

/**
 * The HASH app's sidebar, closed (3 Nov layout; hash-frontend): a 42 px white strip down the whole left edge with a
 * hairline on its right, the workspace avatar 16 px down, and the open-sidebar arrow 12 px under it.
 */
const stripStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "3",
  flexShrink: 0,
  width: "[42px]",
  height: "[100%]",
  paddingTop: "4",
  backgroundColor: "neutral.bgSolid.min",
  borderRightWidth: "thin",
  borderRightStyle: "solid",
  borderRightColor: "neutral.bd.subtle",
});

const WorkspaceAvatar = () => (
  <Avatar
    size="xs"
    shape="square"
    src={workspaceAvatar}
    alt="Workspace"
    placeholder={{ initials: "H" }}
  />
);

const Strip = ({ onOpen }: { onOpen: () => void }) => (
  <nav className={stripStyle} aria-label="HASH" data-hash-strip>
    <WorkspaceAvatar />
    <Button
      size="sm"
      variant="ghost"
      tone="neutral"
      iconName="arrowRight"
      aria-label="Open sidebar"
      tooltip="Open sidebar"
      data-open-sidebar
      onClick={onOpen}
    />
  </nav>
);

const sidebarStyle = css({
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  width: "[260px]",
  height: "[100%]",
  backgroundColor: "neutral.bgSolid.min",
  borderRightWidth: "thin",
  borderRightStyle: "solid",
  borderRightColor: "neutral.bd.subtle",
});

const topRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  height: "[56px]",
  paddingX: "2",
  flexShrink: 0,
});

/** The workspace switcher: the 20 px workspace avatar, its name, a chevron, as one 28 px ghost control. */
const switcherStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flex: "1",
  minWidth: "[0]",
  height: "[28px]",
  paddingX: "1.5",
  borderRadius: "md",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.heading",
  cursor: "pointer",
  _hover: { backgroundColor: "neutral.bg.surface.active" },
  "& > span": {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

const navStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  paddingX: "2",
  flex: "1",
  overflowY: "auto",
});

/** hash-frontend `TopNavLink`: a 16 px icon in a 20 px slot, the label in Medium, grey until hovered or active. */
const navRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  width: "[100%]",
  height: "[32px]",
  paddingX: "2",
  borderRadius: "md",
  textAlign: "left",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.muted.hover",
  cursor: "pointer",
  "& svg": { color: "neutral.fg.subtle", flexShrink: 0 },
  _hover: {
    backgroundColor: "neutral.bg.surface.active",
    color: "neutral.fg.heading",
  },
  "&[aria-current=page]": {
    backgroundColor: "neutral.bg.surface.active",
    color: "neutral.fg.heading",
    "& svg": { color: "neutral.fg.muted" },
  },
  // A page under an open section: no fill, only darker text, as hash-frontend draws a nav link's children.
  "&[data-child]": {
    paddingLeft: "[36px]",
    _hover: { backgroundColor: "neutral.bg.surface.hover" },
  },
  "&[data-child][aria-current=page]": { backgroundColor: "[transparent]" },
  "&[aria-disabled=true]": { cursor: "default" },
});

const iconSlotStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "[20px]",
});

const accountStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  height: "[56px]",
  paddingX: "4",
  flexShrink: 0,
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.fg.muted.hover",
  borderTopWidth: "thin",
  borderTopStyle: "solid",
  borderTopColor: "neutral.bd.subtle",
});

type NavPage = {
  title: string;
  path: string;
  /** Whether the page is the one on screen. */
  matches: (route: Route) => boolean;
};

const flowsPages: NavPage[] = [
  {
    title: "All flows",
    path: "/flows",
    matches: (route) =>
      route.page === "flows" ||
      route.page === "newFlow" ||
      route.page === "editor" ||
      route.page === "history" ||
      route.page === "run",
  },
  {
    title: "Triggers",
    path: "/flows/triggers",
    matches: (route) => route.page === "triggers",
  },
  {
    title: "All runs",
    path: "/runs",
    matches: (route) => route.page === "runs",
  },
];

/** The rest of the HASH app: drawn as in hash-frontend, not part of this prototype. */
const otherSections: { title: string; icon: LucideIcon; before: boolean }[] = [
  { title: "Home", icon: House, before: true },
  { title: "Inbox", icon: Inbox, before: true },
  { title: "Entities", icon: Asterisk, before: false },
  { title: "Types", icon: Shapes, before: false },
];

const NavIcon = ({ icon: Lucide }: { icon: LucideIcon }) => (
  <span className={iconSlotStyle}>
    <Lucide size={16} strokeWidth={iconStroke} aria-hidden />
  </span>
);

const OtherRow = ({ title, icon }: { title: string; icon: LucideIcon }) => (
  <Tooltip content="Not in this prototype" position="right">
    <button
      type="button"
      className={navRowStyle}
      aria-disabled="true"
      data-control-check="skip"
    >
      <NavIcon icon={icon} />
      {title}
    </button>
  </Tooltip>
);

/** The open sidebar. `onClose` is its arrow; `onNavigate` runs after a Flows page is picked. */
const Sidebar = ({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate?: () => void;
}) => {
  const { route } = useLocation();
  const inFlows =
    route.page !== "legacy" && flowsPages.some((page) => page.matches(route));
  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };
  return (
    <nav className={sidebarStyle} aria-label="HASH" data-hash-sidebar>
      <div className={topRowStyle}>
        <button
          type="button"
          className={switcherStyle}
          data-control-check="skip"
        >
          <WorkspaceAvatar />
          <span>HASH</span>
          <Icon name="chevronDown" size="sm" />
        </button>
        <Button
          size="sm"
          variant="ghost"
          tone="neutral"
          iconName="arrowLeft"
          aria-label="Close sidebar"
          tooltip="Close sidebar"
          data-close-sidebar
          onClick={onClose}
        />
      </div>
      <div className={navStyle}>
        {otherSections
          .filter((section) => section.before)
          .map((section) => (
            <OtherRow key={section.title} {...section} />
          ))}
        <button
          type="button"
          className={navRowStyle}
          aria-current={inFlows ? "page" : undefined}
          data-control-check="skip"
          data-nav="flows"
          onClick={() => go("/flows")}
        >
          <NavIcon icon={Zap} />
          Flows
        </button>
        {inFlows
          ? flowsPages.map((page) => (
              <button
                key={page.path}
                type="button"
                className={navRowStyle}
                data-child
                data-control-check="skip"
                data-nav={page.path}
                aria-current={page.matches(route) ? "page" : undefined}
                onClick={() => go(page.path)}
              >
                {page.title}
              </button>
            ))
          : null}
        {otherSections
          .filter((section) => !section.before)
          .map((section) => (
            <OtherRow key={section.title} {...section} />
          ))}
      </div>
      <div className={accountStyle}>
        <Avatar
          alt="Your account"
          size="xs"
          shape="circle"
          placeholder={{ initials: "AS" }}
        />
        Aakarsh Singh
      </div>
    </nav>
  );
};

const overlayBackdropStyle = css({
  position: "fixed",
  inset: "[0]",
  zIndex: "[1000]",
});

const overlayPanelStyle = css({
  position: "fixed",
  top: "[0]",
  bottom: "[0]",
  left: "[0]",
  zIndex: "[1001]",
  display: "flex",
  boxShadow: "[0 8px 32px rgba(0, 0, 0, 0.12)]",
});

/**
 * The editor's, History's and a run's shell: the 42 px strip, whose arrow opens the sidebar over the page. Esc, a
 * click outside it, its own arrow or picking a page closes it.
 */
export const HashShellStrip = () => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
      }
    };
    globalThis.addEventListener("keydown", onKey, true);
    return () => globalThis.removeEventListener("keydown", onKey, true);
  }, [open]);
  return (
    <>
      <Strip onOpen={() => setOpen(true)} />
      {open ? (
        <>
          <div
            className={overlayBackdropStyle}
            data-sidebar-backdrop
            onPointerDown={() => setOpen(false)}
          />
          <div className={overlayPanelStyle} data-sidebar-overlay>
            <Sidebar
              onClose={() => setOpen(false)}
              onNavigate={() => setOpen(false)}
            />
          </div>
        </>
      ) : null}
    </>
  );
};

const shellStyle = css({
  display: "flex",
  height: "[100vh]",
  width: "[100vw]",
  overflow: "hidden",
  backgroundColor: "neutral.bgSolid.min",
  fontFamily: "body",
  color: "neutral.fg.heading",
});

const shellMainStyle = css({
  flex: "1",
  minWidth: "[0]",
  height: "[100%]",
  overflowY: "auto",
});

/** A list page's shell: the sidebar open beside the page (its arrow closes it to the strip, remembered). */
export const HashShell = ({ children }: { children: React.ReactNode }) => {
  const collapsed = useCollapsed();
  return (
    <div className={`${shellStyle} petrinaut-root`}>
      {collapsed ? (
        <Strip onOpen={() => setCollapsed(false)} />
      ) : (
        <Sidebar onClose={() => setCollapsed(true)} />
      )}
      <div className={shellMainStyle}>{children}</div>
    </div>
  );
};
