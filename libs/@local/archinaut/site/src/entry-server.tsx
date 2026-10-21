/**
 * The prerender entry: renders one URL to HTML with the same router the
 * browser hydrates, plus the title and description the document head needs.
 */

import "./styles/site.css";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { createAppRouter } from "./app";
import { pagesBySlug, slugOf } from "./pages";

export interface RenderedPage {
  html: string;
  title: string;
  description: string;
  /** Whether the URL names a page; a miss renders the not-found page. */
  found: boolean;
}

export const render = async (url: string): Promise<RenderedPage> => {
  const router = createAppRouter(
    createMemoryHistory({ initialEntries: [url] }),
  );
  await router.load();
  const html = renderToString(<RouterProvider router={router} />);
  const page = pagesBySlug.get(slugOf(url));
  return {
    html,
    title: page?.title ?? "Page not found",
    description: page?.description ?? "",
    found: page !== undefined,
  };
};
