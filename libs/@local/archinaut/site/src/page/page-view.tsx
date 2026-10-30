/**
 * One page: its title, its compiled content, and "On this page" beside it
 * on wide viewports or above it on narrow ones. The index route and the
 * splat route both render it, each from its own typed loader data.
 */

import { getRouteApi } from "@tanstack/react-router";
import { useEffect } from "react";

import siteJson from "../content/site.json";
import { PageFrame } from "./shared/page-frame";
import { TableOfContents } from "./toc";

import type { LoadedPage } from "../pages";

const site = siteJson as { title: string };

const PageView = ({ page, Content }: LoadedPage) => {
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
      <PageFrame title={page.title}>
        <Content />
      </PageFrame>
    </div>
  );
};

const indexRoute = getRouteApi("/");
const splatRoute = getRouteApi("/$");

export const IndexPageView = () => <PageView {...indexRoute.useLoaderData()} />;

export const SplatPageView = () => <PageView {...splatRoute.useLoaderData()} />;
