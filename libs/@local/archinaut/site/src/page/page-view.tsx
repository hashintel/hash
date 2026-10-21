/**
 * One page: its title, its compiled content, and "On this page" beside it
 * on wide viewports or above it on narrow ones.
 */

import { useLoaderData } from "@tanstack/react-router";
import { useEffect } from "react";

import siteJson from "../content/site.json";
import { TableOfContents } from "./toc";

import type { LoadedPage } from "../pages";

const site = siteJson as { title: string };

export const PageView = () => {
  const { page, Content } = useLoaderData({ strict: false }) as LoadedPage;
  useEffect(() => {
    document.title = `${page.title} | ${site.title}`;
  }, [page.title]);
  return (
    <div className="lg:sl-flex">
      <aside className="right-sidebar-container print:hidden">
        <div className="right-sidebar">
          <TableOfContents key={page.slug} entries={page.headings} />
        </div>
      </aside>
      <div className="main-pane">
        <main>
          <div className="content-panel">
            <div className="sl-container">
              <h1 id="_top">{page.title}</h1>
            </div>
          </div>
          <div className="content-panel">
            <div className="sl-container">
              <div className="sl-markdown-content">
                <Content />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
