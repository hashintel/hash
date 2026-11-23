import { Link } from "@tanstack/react-router";
/**
 * The fixed header: the sidebar toggle, the site title, the diff badges on
 * a diff build, the sidebar resize handle, search and the theme select. The fade bands under the header and over the sidebar live here
 * too, since they are positioned against the viewport, not laid out.
 */
import { useSyncExternalStore } from "react";

import { StaticHashIcon } from "@hashintel/ds-icons/static";

import logoUrl from "../content/logo.png";
import siteJson from "../content/site.json";
import { Search } from "../search";
import { LaptopIcon } from "./icons";
import { readTheme, setTheme, subscribeTheme, type Theme } from "./theme";

import type { DiffCompareContext } from "../diff-context";

declare const __PND_DIFF_COMPARE__: DiffCompareContext | null;

const site = siteJson as { title: string; description: string; url: string };

const diffCompare: DiffCompareContext | null =
  typeof __PND_DIFF_COMPARE__ === "undefined" ? null : __PND_DIFF_COMPARE__;

const SidebarToggle = () => (
  <button
    className="pnd-sidebar-toggle"
    type="button"
    aria-controls="starlight__sidebar"
    aria-expanded="true"
    aria-label="Toggle sidebar"
  >
    <StaticHashIcon aria-hidden="true" width="16" height="16" name="sidebar" />
  </button>
);

const DiffBadges = () =>
  diffCompare === null ? null : (
    <span className="pnd-diff-compare">
      <a
        className="pnd-diff-chip"
        href={diffCompare.head.href}
        title={diffCompare.head.title}
      >
        <span className="pnd-diff-chip-name">{diffCompare.head.label}</span>
        {diffCompare.head.sha === null ? null : (
          <code>{diffCompare.head.sha}</code>
        )}
      </a>
      <span className="pnd-diff-compare-arrow" aria-hidden="true">
        →
      </span>
      <a
        className="pnd-diff-chip"
        href={diffCompare.base.href}
        title={diffCompare.base.title}
      >
        <span className="pnd-diff-chip-name">{diffCompare.base.label}</span>
        {diffCompare.base.sha === null ? null : (
          <code>{diffCompare.base.sha}</code>
        )}
      </a>
    </span>
  );

const ThemeSelect = () => {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "auto");
  return (
    <label
      className="pnd-select"
      style={{ "--sl-select-width": "6.25em" } as never}
    >
      <span className="sr-only">Select theme</span>
      <LaptopIcon className="icon label-icon" />
      <select
        autoComplete="off"
        value={theme}
        onChange={(event) => setTheme(event.currentTarget.value as Theme)}
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="auto">Auto</option>
      </select>
      <StaticHashIcon
        className="icon caret"
        aria-hidden="true"
        width="1em"
        height="1em"
        name="chevronDown"
      />
    </label>
  );
};

export const Header = () => (
  <>
    <div className="header-bar">
      <div className="title-wrapper sl-flex">
        <SidebarToggle />
        <Link to="/" className="site-title sl-flex">
          <img alt={site.title} src={logoUrl} height="32" />
          <span translate="no">{site.title}</span>
        </Link>
        <DiffBadges />
        <div
          className="pnd-sidebar-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          tabIndex={0}
        />
        <div className="pnd-fade pnd-content-fade" aria-hidden="true">
          <span />
        </div>
        <div className="pnd-fade pnd-nav-fade" aria-hidden="true">
          <span />
        </div>
        <div
          className="pnd-fade pnd-fade-up pnd-nav-fade-bottom"
          aria-hidden="true"
        >
          <span />
        </div>
      </div>
      <div className="sl-flex print:hidden">
        <Search />
      </div>
      <div className="sl-hidden md:sl-flex right-group print:hidden">
        <ThemeSelect />
      </div>
    </div>
  </>
);
