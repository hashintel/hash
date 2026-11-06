/**
 * The prototype's URL routes (History API, no router library). The address bar always says where you are, so a
 * reload or a hot update lands on the same page:
 *
 * - `/flows`: the flows list.
 * - `/flows/new`: makes a flow and replaces itself with `/flows/<id>`.
 * - `/flows/:flowId`: the editor.
 * - `/flows/:flowId/logs`: the flow's runs, the Logs page (named History before 5 Nov; `/history` redirects here).
 * - `/flows/:flowId/runs/:runId`: one run.
 * - `/flows/:flowId/triggers`, `/flows/triggers`: the Flows › Triggers page.
 * - `/runs`: runs across every flow.
 *
 * Selection lives in the query: `?step=<stepId>` and `?panel=log`. Vite's dev server serves index.html for every
 * path (`appType: "spa"`, its default).
 */
import { useSyncExternalStore } from "react";

export type Route =
  | { page: "flows"; empty?: boolean }
  | { page: "newFlow" }
  | { page: "editor"; flowId: string }
  | { page: "history"; flowId: string }
  | { page: "run"; flowId: string; runId: number }
  | { page: "triggers"; flowId: string | null }
  | { page: "runs" }
  /** `/` with a legacy query (`?screen=J1.4`, `?state=run-a`, `?task`, `?guide`, `?results`). */
  | { page: "legacy" };

export const parseRoute = (pathname: string, search: string): Route => {
  const parts = pathname.split("/").filter(Boolean);
  const query = new URLSearchParams(search);
  if (parts[0] === "runs") {
    return { page: "runs" };
  }
  if (parts[0] !== "flows") {
    return { page: "legacy" };
  }
  const [, flowId, section, runId] = parts;
  if (!flowId) {
    return { page: "flows", empty: query.has("empty") };
  }
  if (flowId === "new") {
    return { page: "newFlow" };
  }
  if (flowId === "triggers") {
    return { page: "triggers", flowId: null };
  }
  if (section === "logs" || section === "history") {
    return { page: "history", flowId };
  }
  if (section === "runs" && runId && Number.isFinite(Number(runId))) {
    return { page: "run", flowId, runId: Number(runId) };
  }
  if (section === "triggers") {
    return { page: "triggers", flowId };
  }
  return { page: "editor", flowId };
};

export const routePath = (route: Route): string => {
  switch (route.page) {
    case "flows":
      return route.empty ? "/flows?empty" : "/flows";
    case "newFlow":
      return "/flows/new";
    case "editor":
      return `/flows/${route.flowId}`;
    case "history":
      return `/flows/${route.flowId}/logs`;
    case "run":
      return `/flows/${route.flowId}/runs/${route.runId}`;
    case "triggers":
      return route.flowId
        ? `/flows/${route.flowId}/triggers`
        : "/flows/triggers";
    case "runs":
      return "/runs";
    default:
      return "/";
  }
};

const changeEvent = "flows-proto:navigate";

/** Old `/flows/:flowId/history` links land on `/flows/:flowId/logs`, query kept. */
const redirectHistoryPath = () => {
  const { pathname, search } = globalThis.location;
  const match = /^\/flows\/([^/]+)\/history\/?$/.exec(pathname);
  if (match) {
    globalThis.history.replaceState(
      null,
      "",
      `/flows/${match[1]}/logs${search}`,
    );
  }
};

redirectHistoryPath();
globalThis.addEventListener("popstate", redirectHistoryPath);

/** Demo takes a page change keeps, so a take stays on while you click through. URL only, never remembered. */
const carriedTakes = [
  "runback",
  "rundropdown",
  "foreachswitch",
  "highlightlook",
  "runid",
];

const withCarriedTakes = (path: string) => {
  const current = new URLSearchParams(globalThis.location.search);
  const carried = carriedTakes.filter((key) => current.has(key));
  if (carried.length === 0) {
    return path;
  }
  const url = new URL(path, globalThis.location.origin);
  for (const key of carried) {
    if (!url.searchParams.has(key)) {
      url.searchParams.set(key, current.get(key) ?? "");
    }
  }
  return `${url.pathname}${url.search}`;
};

/** The page a history entry was opened from, kept in its `history.state` (so Back, Forward and reload keep it). */
export const cameFrom = (): string | null => {
  const state: unknown = globalThis.history.state;
  return state &&
    typeof state === "object" &&
    "from" in state &&
    typeof state.from === "string"
    ? state.from
    : null;
};

export const navigate = (path: string, options: { replace?: boolean } = {}) => {
  const current = `${globalThis.location.pathname}${globalThis.location.search}`;
  const next = withCarriedTakes(path);
  if (next === current) {
    return;
  }
  // A replaced entry, or a move between runs, keeps where the first page was opened from.
  const fromPath =
    options.replace ||
    (parseRoute(globalThis.location.pathname, "").page === "run" &&
      parseRoute(new URL(next, globalThis.location.origin).pathname, "")
        .page === "run")
      ? cameFrom()
      : globalThis.location.pathname;
  const state = { from: fromPath };
  if (options.replace) {
    globalThis.history.replaceState(state, "", next);
  } else {
    globalThis.history.pushState(state, "", next);
  }
  globalThis.dispatchEvent(new Event(changeEvent));
};

/** Updates one query value in place (no new history entry): selection, not navigation. */
export const setQuery = (key: string, value: string | null) => {
  const url = new URL(globalThis.location.href);
  if (value === null) {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }
  const next = `${url.pathname}${url.search}`;
  if (next !== `${globalThis.location.pathname}${globalThis.location.search}`) {
    globalThis.history.replaceState(null, "", next);
    globalThis.dispatchEvent(new Event(changeEvent));
  }
};

const subscribe = (onChange: () => void) => {
  globalThis.addEventListener("popstate", onChange);
  globalThis.addEventListener(changeEvent, onChange);
  return () => {
    globalThis.removeEventListener("popstate", onChange);
    globalThis.removeEventListener(changeEvent, onChange);
  };
};

const snapshot = () =>
  `${globalThis.location.pathname}${globalThis.location.search}`;

/** The current path and query; re-renders on navigation, Back and Forward. */
export const useLocation = () => {
  const href = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(href, globalThis.location.origin);
  return {
    pathname: url.pathname,
    search: url.search,
    query: url.searchParams,
    route: parseRoute(url.pathname, url.search),
  };
};
