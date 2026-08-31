/**
 * @layerRoot website.routes
 * @role Owns the URL: file-based routes, typed search params, and the route tree
 */

import { Outlet, createRootRoute } from "@tanstack/react-router";

import { NotFoundPage } from "./-not-found-page";

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundPage,
});
