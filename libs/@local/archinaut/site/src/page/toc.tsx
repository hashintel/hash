/**
 * "On this page": the page's `h2` and `h3` headings, the one in view
 * marked, as a panel beside the content on wide viewports and a dropdown
 * under the header on narrow ones.
 */

import { useEffect, useState } from "react";

import { CaretIcon } from "../shell/icons";

import type { TocEntry } from "../pages";

/** The id of the heading currently in view, by watching the content scroll. */
const useActiveHeading = (entries: TocEntry[]): string => {
  const [active, setActive] = useState("_top");
  useEffect(() => {
    const main = document.querySelector("main");
    if (main === null) {
      return undefined;
    }
    const navHeight =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--sl-nav-height",
        ),
      ) * 16 || 56;
    const headings = [
      document.getElementById("_top"),
      ...entries.map((entry) => document.getElementById(entry.slug)),
    ].filter((heading): heading is HTMLElement => heading !== null);
    const observer = new IntersectionObserver(
      (observed) => {
        for (const entry of observed) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: `-${navHeight}px 0% -66%` },
    );
    for (const heading of headings) {
      observer.observe(heading);
    }
    return () => observer.disconnect();
  }, [entries]);
  return active;
};

const List = ({
  entries,
  active,
  mobile,
}: {
  entries: TocEntry[];
  active: string;
  mobile: boolean;
}) => (
  <ul className={mobile ? "isMobile" : undefined}>
    {entries.map((entry) => (
      <li key={entry.slug}>
        <a
          href={`#${entry.slug}`}
          aria-current={entry.slug === active ? "true" : undefined}
          style={{ "--depth": entry.depth - 2 } as never}
        >
          <span>{entry.text}</span>
        </a>
      </li>
    ))}
  </ul>
);

export const TableOfContents = ({ entries }: { entries: TocEntry[] }) => {
  const all = [{ depth: 2, slug: "_top", text: "Overview" }, ...entries];
  const active = useActiveHeading(entries);
  const current = all.find((entry) => entry.slug === active) ?? all[0];
  return (
    <>
      <div className="lg:sl-hidden">
        <nav
          className="pnd-mobile-toc"
          aria-labelledby="starlight__on-this-page--mobile"
        >
          <details id="starlight__mobile-toc">
            <summary id="starlight__on-this-page--mobile" className="sl-flex">
              <span className="toggle sl-flex">
                On this page
                <CaretIcon className="caret" size="1rem" />
              </span>
              <span className="display-current">{current?.text}</span>
            </summary>
            <div className="dropdown">
              <List entries={all} active={active} mobile />
            </div>
          </details>
        </nav>
      </div>
      <div className="right-sidebar-panel sl-hidden lg:sl-block">
        <div className="sl-container">
          <nav aria-labelledby="starlight__on-this-page">
            <h2 id="starlight__on-this-page">On this page</h2>
            <List entries={all} active={active} mobile={false} />
          </nav>
        </div>
      </div>
    </>
  );
};
