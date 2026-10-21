/**
 * The frame every page renders in: skip link, header, the navigation rail
 * with its mobile toggle, and the main frame the router fills. Links inside
 * page content are plain anchors the bundle wrote; a click on one that
 * stays on this site goes through the router, so no navigation reloads the
 * document.
 */

import { Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { sidebarItems, slugOf } from "../pages";
import { Header } from "./header";
import { BarsIcon, CloseIcon } from "./icons";
import { Sidebar } from "./sidebar";
import { installSidebarChrome } from "./sidebar-chrome";

const items = sidebarItems();

const isPlainLeftClick = (event: MouseEvent): boolean =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey &&
  !event.defaultPrevented;

/** Same-document navigation for anchors in page content. */
const useContentLinks = (): void => {
  const router = useRouter();
  useEffect(() => {
    const onClick = (event: MouseEvent): void => {
      if (!isPlainLeftClick(event) || !(event.target instanceof Element)) {
        return;
      }
      const anchor = event.target.closest("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target !== "" ||
        anchor.hasAttribute("download") ||
        anchor.origin !== window.location.origin
      ) {
        return;
      }
      event.preventDefault();
      void router.navigate({
        href: `${anchor.pathname}${anchor.search}${anchor.hash}`,
      });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);
};

const useSidebarChrome = (): void => {
  useEffect(() => installSidebarChrome(), []);
};

const MobileMenuToggle = ({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) => (
  <span
    className="pnd-menu-button print:hidden"
    data-expanded={expanded ? "" : undefined}
  >
    <button
      type="button"
      aria-expanded={expanded}
      aria-label="Menu"
      aria-controls="starlight__sidebar"
      className="sl-flex md:sl-hidden"
      onClick={onToggle}
    >
      {expanded ? <CloseIcon size="1.5em" /> : <BarsIcon size="1.5em" />}
    </button>
  </span>
);

export const Shell = () => {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const current = slugOf(pathname);
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [previousPath, setPreviousPath] = useState(pathname);
  if (pathname !== previousPath) {
    setPreviousPath(pathname);
    setMenuExpanded(false);
  }
  useContentLinks();
  useSidebarChrome();
  useEffect(() => {
    document.body.toggleAttribute("data-mobile-menu-expanded", menuExpanded);
    return () => document.body.removeAttribute("data-mobile-menu-expanded");
  }, [menuExpanded]);

  return (
    <>
      <a className="sl-skip-link" href="#_top">
        Skip to content
      </a>
      <div className="page sl-flex">
        <header className="header">
          <Header />
        </header>
        <nav className="sidebar print:hidden" aria-label="Main">
          <MobileMenuToggle
            expanded={menuExpanded}
            onToggle={() => setMenuExpanded(!menuExpanded)}
          />
          <div
            id="starlight__sidebar"
            className="sidebar-pane"
            data-expanded={menuExpanded ? "" : undefined}
          >
            <div className="sidebar-content sl-flex">
              <Sidebar items={items} current={current} />
            </div>
          </div>
        </nav>
        <div className="main-frame" inert={menuExpanded}>
          <Outlet />
        </div>
      </div>
    </>
  );
};
