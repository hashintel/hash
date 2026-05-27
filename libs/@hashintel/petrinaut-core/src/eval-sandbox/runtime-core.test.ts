// @vitest-environment jsdom
/// <reference lib="dom" />
/* eslint-disable no-restricted-globals -- This test drives the in-iframe
 * side of the sandbox RPC under jsdom. To exercise it we have to stand
 * in for the parent `Window` (which `runtime-core.ts` reaches via
 * `window.parent`) and replay messages through the real `window` event
 * loop. Production code (runtime-core.ts) keeps using structural
 * `SandboxIframeGlobal`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountCoreSandboxRuntime } from "./runtime-core";

import type {
  ParentToSandboxMessage,
  SandboxToParentMessage,
} from "./protocol";

/**
 * Replace `window.parent` with a stand-in so:
 *  - the runtime's `event.source !== window.parent` filter can be
 *    exercised with both matching and non-matching sources, and
 *  - we can capture everything the runtime posts to its parent.
 *
 * Returns helpers + a `restore` to undo the patch (vitest jsdom resets
 * between tests anyway, but explicit restore keeps each test hermetic
 * if anyone adds more globals).
 */
function installFakeParent() {
  const sent: SandboxToParentMessage[] = [];
  const fakeParent: { postMessage: (msg: SandboxToParentMessage) => void } = {
    postMessage: (msg) => {
      sent.push(msg);
    },
  };
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
  Object.defineProperty(window, "parent", {
    configurable: true,
    get: () => fakeParent,
  });

  const sendFromParent = (message: ParentToSandboxMessage) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: message,
        source: fakeParent as unknown as MessageEventSource,
      }),
    );
  };

  const sendFromOther = (message: ParentToSandboxMessage) => {
    // `source` left as a sibling object so the runtime's
    // `event.source !== window.parent` guard rejects it.
    const other = {};
    window.dispatchEvent(
      new MessageEvent("message", {
        data: message,
        source: other as unknown as MessageEventSource,
      }),
    );
  };

  const restore = () => {
    if (originalDescriptor) {
      Object.defineProperty(window, "parent", originalDescriptor);
    } else {
      Reflect.deleteProperty(window, "parent");
    }
  };

  return { sent, sendFromParent, sendFromOther, restore };
}

/**
 * Wait for the next microtask so the runtime's async `handleRequest`
 * has a chance to post its response before we assert.
 */
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

let teardown: (() => void) | null = null;

afterEach(() => {
  teardown?.();
  teardown = null;
});

describe("mountCoreSandboxRuntime", () => {
  it("posts a `ready` envelope to the parent on mount", () => {
    const fake = installFakeParent();
    try {
      teardown = mountCoreSandboxRuntime();
      expect(fake.sent).toEqual([{ type: "ready" }]);
    } finally {
      fake.restore();
    }
  });

  it("answers `ping` with a `ping` response", async () => {
    const fake = installFakeParent();
    try {
      teardown = mountCoreSandboxRuntime();
      fake.sendFromParent({
        type: "request",
        requestId: "req-1",
        request: { kind: "ping" },
      });
      await flushMicrotasks();
      // `ready` then the ping response.
      expect(fake.sent[1]).toEqual({
        type: "response",
        requestId: "req-1",
        response: { kind: "ping" },
      });
    } finally {
      fake.restore();
    }
  });

  it("compiles a metric and evaluates it via `evaluateMetric`", async () => {
    const fake = installFakeParent();
    try {
      teardown = mountCoreSandboxRuntime();
      fake.sendFromParent({
        type: "request",
        requestId: "create",
        request: {
          kind: "createMetricEvaluator",
          metric: {
            id: "m1",
            name: "double-A",
            code: "return state.places.A.count * 2;",
          },
        },
      });
      await flushMicrotasks();

      const createReply = fake.sent.find(
        (msg): msg is Extract<SandboxToParentMessage, { type: "response" }> =>
          msg.type === "response" && msg.requestId === "create",
      );
      expect(createReply).toBeTruthy();
      if (
        !createReply ||
        createReply.response.kind !== "createMetricEvaluator"
      ) {
        throw new Error("unexpected reply shape");
      }
      const evaluatorId = createReply.response.evaluatorId;

      fake.sendFromParent({
        type: "request",
        requestId: "eval",
        request: {
          kind: "evaluateMetric",
          evaluatorId,
          state: { places: { A: { count: 7, tokens: [] } } },
        },
      });
      await flushMicrotasks();

      const evalReply = fake.sent.find(
        (msg): msg is Extract<SandboxToParentMessage, { type: "response" }> =>
          msg.type === "response" && msg.requestId === "eval",
      );
      expect(evalReply).toMatchObject({
        type: "response",
        requestId: "eval",
        response: { kind: "evaluateMetric", result: 14 },
      });
    } finally {
      fake.restore();
    }
  });

  it("`evaluateMetricBatch` returns per-row results and captures runtime errors", async () => {
    const fake = installFakeParent();
    try {
      teardown = mountCoreSandboxRuntime();
      fake.sendFromParent({
        type: "request",
        requestId: "create",
        request: {
          kind: "createMetricEvaluator",
          metric: {
            id: "m1",
            name: "from-A",
            code: "return state.places.A.count;",
          },
        },
      });
      await flushMicrotasks();
      const createReply = fake.sent.find(
        (msg): msg is Extract<SandboxToParentMessage, { type: "response" }> =>
          msg.type === "response" && msg.requestId === "create",
      );
      if (
        !createReply ||
        createReply.response.kind !== "createMetricEvaluator"
      ) {
        throw new Error("unexpected reply shape");
      }
      const evaluatorId = createReply.response.evaluatorId;

      fake.sendFromParent({
        type: "request",
        requestId: "batch",
        request: {
          kind: "evaluateMetricBatch",
          evaluatorId,
          states: [
            { places: { A: { count: 1, tokens: [] } } },
            // No `A` so user code throws — should be captured as a
            // per-row { error } instead of rejecting the batch.
            { places: {} },
          ],
        },
      });
      await flushMicrotasks();
      const batchReply = fake.sent.find(
        (msg): msg is Extract<SandboxToParentMessage, { type: "response" }> =>
          msg.type === "response" && msg.requestId === "batch",
      );
      if (!batchReply || batchReply.response.kind !== "evaluateMetricBatch") {
        throw new Error("unexpected reply shape");
      }
      expect(batchReply.response.results[0]).toBe(1);
      const secondRow = batchReply.response.results[1];
      expect(typeof secondRow).toBe("object");
      expect(secondRow).toHaveProperty("error");
    } finally {
      fake.restore();
    }
  });

  it("returns `responseError` when metric compile fails", async () => {
    const fake = installFakeParent();
    try {
      teardown = mountCoreSandboxRuntime();
      fake.sendFromParent({
        type: "request",
        requestId: "bad",
        request: {
          kind: "createMetricEvaluator",
          metric: { id: "m", name: "broken", code: "return (" },
        },
      });
      await flushMicrotasks();
      const errReply = fake.sent.find(
        (msg) => msg.type === "responseError" && msg.requestId === "bad",
      );
      expect(errReply).toBeTruthy();
    } finally {
      fake.restore();
    }
  });

  it("`disposeMetricEvaluator` removes the evaluator", async () => {
    const fake = installFakeParent();
    try {
      teardown = mountCoreSandboxRuntime();
      fake.sendFromParent({
        type: "request",
        requestId: "create",
        request: {
          kind: "createMetricEvaluator",
          metric: { id: "m", name: "noop", code: "return 0;" },
        },
      });
      await flushMicrotasks();
      const createReply = fake.sent.find(
        (msg): msg is Extract<SandboxToParentMessage, { type: "response" }> =>
          msg.type === "response" && msg.requestId === "create",
      );
      if (
        !createReply ||
        createReply.response.kind !== "createMetricEvaluator"
      ) {
        throw new Error("unexpected reply shape");
      }
      const evaluatorId = createReply.response.evaluatorId;

      fake.sendFromParent({
        type: "request",
        requestId: "dispose",
        request: { kind: "disposeMetricEvaluator", evaluatorId },
      });
      await flushMicrotasks();

      // Subsequent evaluation should error because the id is unknown.
      fake.sendFromParent({
        type: "request",
        requestId: "eval-after-dispose",
        request: {
          kind: "evaluateMetric",
          evaluatorId,
          state: { places: {} },
        },
      });
      await flushMicrotasks();

      const errReply = fake.sent.find(
        (msg) =>
          msg.type === "responseError" &&
          msg.requestId === "eval-after-dispose",
      );
      expect(errReply).toBeTruthy();
    } finally {
      fake.restore();
    }
  });

  it("ignores messages whose `source` is not the configured parent", async () => {
    const fake = installFakeParent();
    try {
      teardown = mountCoreSandboxRuntime();
      fake.sendFromOther({
        type: "request",
        requestId: "forged",
        request: { kind: "ping" },
      });
      await flushMicrotasks();
      // Only the `ready` should be present; no `response`.
      expect(fake.sent).toEqual([{ type: "ready" }]);
    } finally {
      fake.restore();
    }
  });

  it("forwards uncaught window errors as `uncaughtError`", () => {
    const fake = installFakeParent();
    try {
      teardown = mountCoreSandboxRuntime();
      // Suppress the inevitable "Uncaught" log noise from jsdom.
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      window.dispatchEvent(
        new ErrorEvent("error", { error: new Error("boom") }),
      );
      const uncaught = fake.sent.find((msg) => msg.type === "uncaughtError");
      expect(uncaught).toMatchObject({
        type: "uncaughtError",
        origin: "sandbox",
        error: { name: "Error", message: "boom" },
      });
      consoleSpy.mockRestore();
    } finally {
      fake.restore();
    }
  });

  it("teardown removes listeners so post-teardown messages are ignored", async () => {
    const fake = installFakeParent();
    try {
      const stop = mountCoreSandboxRuntime();
      stop();
      teardown = null;
      const baseline = fake.sent.length;
      fake.sendFromParent({
        type: "request",
        requestId: "after-teardown",
        request: { kind: "ping" },
      });
      await flushMicrotasks();
      expect(fake.sent.length).toBe(baseline);
    } finally {
      fake.restore();
    }
  });
});
