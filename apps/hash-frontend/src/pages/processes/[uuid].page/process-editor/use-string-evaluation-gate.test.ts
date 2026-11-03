// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  canEvaluateStrings,
  runStringEvaluationGate,
  useStringEvaluationGate,
} from "./use-string-evaluation-gate";

afterEach(() => {
  cleanup();
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
