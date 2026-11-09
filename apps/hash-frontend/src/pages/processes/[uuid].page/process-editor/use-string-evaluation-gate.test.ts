// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  canEvaluateStrings,
  reloadOnLeavingEditorPolicy,
  runStringEvaluationGate,
  useStringEvaluationGate,
} from "./use-string-evaluation-gate";

vi.mock("next/router", () => ({
  useRouter: () => ({ events: { on: () => {}, off: () => {} } }),
}));

afterEach(() => {
  cleanup();
});

const createRouterEvents = () => {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  return {
    on: (type: string, handler: (...args: unknown[]) => void) => {
      const forType = handlers.get(type) ?? new Set();
      forType.add(handler);
      handlers.set(type, forType);
    },
    off: (type: string, handler: (...args: unknown[]) => void) => {
      handlers.get(type)?.delete(handler);
    },
    emit: (type: string, ...args: unknown[]) => {
      for (const handler of [...(handlers.get(type) ?? [])]) {
        handler(...args);
      }
    },
  };
};

/** The shape of the error Next's router reports for a cancelled route change. */
const routeCancelled = () =>
  Object.assign(new Error("Route Cancelled"), { cancelled: true });

const watchFrom = (loadedAt: string | null) => {
  const events = createRouterEvents();
  const reload = vi.fn();
  let asPath = loadedAt ?? "/";
  const stop = reloadOnLeavingEditorPolicy({
    events,
    documentPathname: () => loadedAt,
    committedAsPath: () => asPath,
    origin: "https://hash.test",
    reload,
  });
  /** Next's ordering: report, change history, then commit router state. */
  const changeHistory = (url: string) => {
    events.emit("beforeHistoryChange", url);
    asPath = url;
  };
  return { events, reload, stop, changeHistory };
};

describe("reloadOnLeavingEditorPolicy", () => {
  test.each(["/processes", "/processes?tab=all", "/@alice"])(
    "reloads once the document has left the editor for %s",
    (url) => {
      const { events, reload } = watchFrom("/processes/abc");

      events.emit("routeChangeStart", url);
      expect(reload).not.toHaveBeenCalled();
      events.emit("routeChangeComplete", url);
      events.emit("routeChangeComplete", url);

      expect(reload).toHaveBeenCalledTimes(1);
    },
  );

  test("doesn't reload when the destination is another editor", () => {
    const { events, reload } = watchFrom("/processes/draft");

    events.emit("routeChangeStart", "/processes/abc");
    events.emit("routeChangeComplete", "/processes/abc");

    expect(reload).not.toHaveBeenCalled();
  });

  test("doesn't reload when the route change to another route is cancelled", () => {
    const { events, reload, changeHistory } = watchFrom("/processes/abc");

    events.emit("routeChangeStart", "/processes");
    events.emit("routeChangeError", routeCancelled(), "/processes");
    events.emit("routeChangeStart", "/processes/def");
    changeHistory("/processes/def");
    events.emit("routeChangeComplete", "/processes/def");

    expect(reload).not.toHaveBeenCalled();
  });

  test("doesn't reload when a route change is cancelled after changing history", () => {
    const { events, reload, changeHistory } = watchFrom("/processes/abc");

    // The second change's render supersedes the first's, after its history change.
    events.emit("routeChangeStart", "/processes");
    changeHistory("/processes");
    events.emit("routeChangeStart", "/processes/def");
    changeHistory("/processes/def");
    events.emit("routeChangeError", routeCancelled(), "/processes");
    events.emit("routeChangeComplete", "/processes/def");

    expect(reload).not.toHaveBeenCalled();
  });

  test("reloads when a change superseding another to a different route completes", () => {
    const { events, reload, changeHistory } = watchFrom("/processes/abc");

    // The first change's render is still pending when the second one commits.
    events.emit("routeChangeStart", "/@alice");
    changeHistory("/@alice");
    events.emit("routeChangeStart", "/processes");
    changeHistory("/processes");
    events.emit("routeChangeError", routeCancelled(), "/@alice");
    expect(reload).not.toHaveBeenCalled();
    events.emit("routeChangeComplete", "/processes");

    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("reloads when a change superseding another to the same route completes", () => {
    const { events, reload, changeHistory } = watchFrom("/processes/abc");

    events.emit("routeChangeStart", "/processes");
    changeHistory("/processes");
    events.emit("routeChangeStart", "/processes");
    changeHistory("/processes");
    events.emit("routeChangeError", routeCancelled(), "/processes");
    expect(reload).not.toHaveBeenCalled();
    events.emit("routeChangeComplete", "/processes");

    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("reloads once the router has shown its error page at another route", () => {
    const { events, reload, changeHistory } = watchFrom("/processes/abc");

    events.emit("routeChangeStart", "/@alice");
    changeHistory("/@alice");
    events.emit("routeChangeError", new Error("getInitialProps"), "/@alice");

    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("leaves a route change that fails before changing history to the router", () => {
    const { events, reload } = watchFrom("/processes/abc");

    // A page that fails to load: Next reports it, then navigates the document itself.
    events.emit("routeChangeStart", "/@alice");
    events.emit(
      "routeChangeError",
      new Error("Failed to load script"),
      "/@alice",
    );

    expect(reload).not.toHaveBeenCalled();
  });

  test("leaves a page that fails to load to the router while an earlier change renders", () => {
    const { events, reload, changeHistory } = watchFrom("/processes/abc");

    events.emit("routeChangeStart", "/processes");
    changeHistory("/processes");
    events.emit("routeChangeStart", "/@alice");
    events.emit(
      "routeChangeError",
      new Error("Failed to load script"),
      "/@alice",
    );

    expect(reload).not.toHaveBeenCalled();
  });

  test.each(["/processes", null])(
    "does nothing in a document loaded at %s",
    (loadedAt) => {
      const { events, reload } = watchFrom(loadedAt);

      events.emit("routeChangeStart", "/@alice");
      events.emit("routeChangeComplete", "/@alice");

      expect(reload).not.toHaveBeenCalled();
    },
  );

  test("still reloads after the editor stops watching, once a departure has started", () => {
    const { events, reload, stop } = watchFrom("/processes/abc");

    events.emit("routeChangeStart", "/processes");
    stop();
    events.emit("routeChangeComplete", "/processes");

    expect(reload).toHaveBeenCalledTimes(1);
  });

  test("stops watching once the editor stops watching, if it only moved to another editor", () => {
    const { events, reload, stop } = watchFrom("/processes/abc");

    events.emit("routeChangeStart", "/processes/def");
    stop();
    events.emit("routeChangeComplete", "/processes/def");
    events.emit("routeChangeComplete", "/processes");

    expect(reload).not.toHaveBeenCalled();
  });

  test("ignores route changes that start after the editor stops watching", () => {
    const { events, reload, stop } = watchFrom("/processes/abc");

    stop();
    events.emit("routeChangeStart", "/processes");
    events.emit("routeChangeComplete", "/processes");

    expect(reload).not.toHaveBeenCalled();
  });
});

describe("runStringEvaluationGate", () => {
  test("reloads once when evaluation is blocked in a document loaded elsewhere", () => {
    const reload = vi.fn();

    const shouldRender = runStringEvaluationGate({
      canEvaluate: () => false,
      documentPathname: () => "/processes",
      reload,
    });

    expect(shouldRender).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test.each(["/processes/draft", "/processes/abc/"])(
    "renders without reloading when evaluation is blocked in a document loaded at %s",
    (pathname) => {
      const reload = vi.fn();

      const shouldRender = runStringEvaluationGate({
        canEvaluate: () => false,
        documentPathname: () => pathname,
        reload,
      });

      expect(shouldRender).toBe(true);
      expect(reload).not.toHaveBeenCalled();
    },
  );

  test("renders without reloading when the document's load path is unknown", () => {
    const reload = vi.fn();

    expect(
      runStringEvaluationGate({
        canEvaluate: () => false,
        documentPathname: () => null,
        reload,
      }),
    ).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  test("renders without reloading when evaluation is allowed", () => {
    const reload = vi.fn();
    const documentPathname = vi.fn(() => "/processes");

    expect(
      runStringEvaluationGate({
        canEvaluate: () => true,
        documentPathname,
        reload,
      }),
    ).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect(documentPathname).not.toHaveBeenCalled();
  });
});

describe("canEvaluateStrings", () => {
  test("is true where nothing blocks evaluation", () => {
    expect(canEvaluateStrings()).toBe(true);
  });

  test("is false when evaluation throws an EvalError", () => {
    const originalFunction = globalThis.Function;
    vi.stubGlobal(
      "Function",
      class {
        constructor() {
          throw new EvalError("Refused to evaluate a string as JavaScript");
        }
      },
    );
    try {
      expect(canEvaluateStrings()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(globalThis.Function).toBe(originalFunction);
  });
});

describe("useStringEvaluationGate", () => {
  test("lets Petrinaut render where evaluation is allowed", () => {
    const { result } = renderHook(() => useStringEvaluationGate());

    expect(result.current).toBe(true);
  });
});
