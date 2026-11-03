/**
 * The router: the docs under one shell, the index at `/` and every other
 * page by its slug, and the decks under `/slides` with no shell at all.
 * Pages and decks load their compiled modules in the route's loader, so a
 * navigation renders nothing until the content is ready and the browser
 * never leaves the document.
 */

import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  notFound,
  type RouterHistory,
} from "@tanstack/react-router";

import { NotFound } from "./page/not-found";
import { IndexPageView, SplatPageView } from "./page/page-view";
import { loadPage, slugOf } from "./pages";
import { Shell } from "./shell/shell";

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
});

const load = async (slug: string) => {
  const loaded = await loadPage(slug);
  if (loaded === null) {
    throw notFound();
  }
  return loaded;
};

const docsLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "docs",
  component: Shell,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => docsLayout,
  path: "/",
  loader: () => load("index"),
  component: IndexPageView,
});

const pageRoute = createRoute({
  getParentRoute: () => docsLayout,
  path: "$",
  loader: ({ params }) => load(slugOf(params._splat ?? "")),
  component: SplatPageView,
});

const deckRoutes = () => import("./slides/routes");

const decksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/slides",
  component: lazyRouteComponent(deckRoutes, "DeckListRoute"),
});

/** The deck list and loader load with the first deck route, never with a docs page. */
const loadWholeDeck = async ({ params }: { params: { deck: string } }) => {
  const { loadDeck } = await import("./slides/decks");
  const loaded = await loadDeck(params.deck);
  if (loaded === null) {
    throw notFound();
  }
  return loaded;
};

const deckRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/slides/$deck",
  loader: loadWholeDeck,
  component: lazyRouteComponent(deckRoutes, "DeckRoute"),
});

/** Every slide at its last step, one per page, for print and `--pdf`. */
const deckPrintRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/slides/$deck/print",
  loader: loadWholeDeck,
  component: lazyRouteComponent(deckRoutes, "DeckPrintRoute"),
});

/** The presenter's window: notes now and next, kept in step by the deck. */
const presenterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/slides/$deck/presenter",
  loader: loadWholeDeck,
  component: lazyRouteComponent(deckRoutes, "PresenterRoute"),
});

const routeTree = rootRoute.addChildren([
  docsLayout.addChildren([indexRoute, pageRoute]),
  decksRoute,
  deckRoute,
  deckPrintRoute,
  presenterRoute,
]);

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
