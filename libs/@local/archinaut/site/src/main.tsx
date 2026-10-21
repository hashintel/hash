/**
 * The browser entry: hydrates the prerendered page, or renders from nothing
 * under the dev server, and hands navigation to the router from then on.
 */

import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/site.css";
import { RouterProvider, createBrowserHistory } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import { createAppRouter } from "./app";

const root = document.getElementById("app");
if (root === null) {
  throw new Error("the page has no #app element");
}
const router = createAppRouter(createBrowserHistory());
await router.load();
const app = (
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
// The prerendered page has elements to hydrate; the dev server's template
// has only the placeholder comment.
if (root.firstElementChild !== null) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
