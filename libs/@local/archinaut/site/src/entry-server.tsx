/**
 * The prerender entry: renders one URL to HTML with the same router the
 * browser hydrates, plus the title and description the document head needs.
 */

import "./styles/site.css";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { createAppRouter } from "./app";
import { pagesBySlug, slugOf } from "./pages";
import { decks } from "./slides/decks";

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
  const slug = slugOf(url);
  const deck = slug.startsWith("slides/")
    ? decks.find((candidate) => candidate.id === slug.split("/")[1])
    : undefined;
  if (slug === "slides" || deck !== undefined) {
    return {
      html,
      title: deck === undefined ? "Slides" : `${deck.title} · Slides`,
      description: deck?.description ?? "",
      found: true,
    };
  }
  const page = pagesBySlug.get(slug);
  return {
    html,
    title: page?.title ?? "Page not found",
    description: page?.description ?? "",
    found: page !== undefined,
  };
};
