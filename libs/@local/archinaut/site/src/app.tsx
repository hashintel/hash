/**
 * The router: one shell around every page, the index at `/`, and every
 * other page by its slug. Pages load their compiled module in the route's
 * loader, so a navigation renders nothing until the page is ready and the
 * browser never leaves the document.
 */

import {
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  type RouterHistory,
} from "@tanstack/react-router";

import { NotFound } from "./page/not-found";
import { IndexPageView, SplatPageView } from "./page/page-view";
import { loadPage, slugOf } from "./pages";
import { Shell } from "./shell/shell";

const rootRoute = createRootRoute({
  component: Shell,
  notFoundComponent: NotFound,
});

const load = async (slug: string) => {
  const loaded = await loadPage(slug);
  if (loaded === null) {
    throw notFound();
  }
  return loaded;
};

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  loader: () => load("index"),
  component: IndexPageView,
});

const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  loader: ({ params }) => load(slugOf(params._splat ?? "")),
  component: SplatPageView,
});

const routeTree = rootRoute.addChildren([indexRoute, pageRoute]);

export const createAppRouter = (history: RouterHistory) =>
  createRouter({
    routeTree,
    history,
    scrollRestoration: true,
    defaultPreload: "intent",
  });

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
