/**
 * Old links land on the app's routes (replaceState, so Back skips them). Imported first in main.tsx: it runs before
 * the app store reads the URL (Run 17's `?at=` moment).
 *
 * - `/` → `/flows`.
 * - `?screen=J6.x`, `J4.1`, `J4.3`, `J0.1`–`J0.3` → the matching route and query. Other `?screen=` ids stay on the
 *   Journeys screens they always opened (`/?screen=J1.4`).
 * - `?state=flows | editor | history | run | triggers` (with `flow=` and `run=`) → the route. Older `?state=` ids
 *   (`run-a`, …) stay.
 */
const review = "/flows/monthly-supplier-review";

const screens: Record<string, string> = {
  "J0.1": "/flows?empty",
  "J0.2": "/flows",
  "J0.3": "/flows/new",
  "J4.1": `${review}?step=start`,
  "J4.3": `${review}?step=ghost:schedule`,
  "J4.4": review,
  "J6.0": `${review}/logs`,
  "J6.1": `${review}/runs/17`,
  "J6.2": `${review}/runs/17?at=62&pin`,
  "J6.3": `${review}/runs/17?at=140&pin`,
  "J6.4": `${review}/runs/16`,
  "J6.5": `${review}/runs/15`,
  "J6.6": `${review}/runs/13`,
  "J6.7": `${review}/runs/16?step=fetchCertificate`,
  "J6.8": `${review}/runs/16?menu=runs`,
  "J6.9": `${review}/runs/16`,
  "J6.10": `${review}/runs/16?panel=log`,
};

const fromState = (query: URLSearchParams): string | undefined => {
  const flow = query.get("flow") ?? "monthly-supplier-review";
  const run = query.get("run");
  switch (query.get("state")) {
    case "flows":
      return "/flows";
    case "editor":
      return `/flows/${flow}`;
    case "history":
      return `/flows/${flow}/logs`;
    case "run":
      return `/flows/${flow}/runs/${run ?? "17"}`;
    case "triggers":
      return query.has("flow") ? `/flows/${flow}/triggers` : "/flows/triggers";
    default:
      return undefined;
  }
};

export const legacyTarget = (
  pathname: string,
  search: string,
): string | undefined => {
  const query = new URLSearchParams(search);
  const screen = query
    .get("screen")
    ?.trim()
    .toUpperCase()
    .replace(/^(?!J)/, "J");
  if (screen && screens[screen]) {
    return screens[screen];
  }
  const state = fromState(query);
  if (state) {
    return state;
  }
  if (pathname === "/" && search === "") {
    return "/flows";
  }
  return undefined;
};

const target = legacyTarget(
  globalThis.location.pathname,
  globalThis.location.search,
);
if (target) {
  globalThis.history.replaceState(null, "", target);
}
