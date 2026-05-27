// @vitest-environment jsdom
/// <reference lib="dom" />
/* eslint-disable no-restricted-globals -- This test deliberately drives
 * the parent-side of the iframe sandbox under jsdom, so it has to touch
 * `window` and construct `MessageEvent`s. The production code that the
 * lint rule guards (eval-sandbox/iframe.ts) keeps using
 * `SandboxParentGlobal` / `SandboxMessageEvent`.
 */
import { describe, expect, it } from "vitest";

import { createIframeCoreSandbox } from "./iframe";
import { serializeError } from "./protocol";

import type { SandboxIframeWindow } from "./browser-types";
import type {
  ParentToSandboxMessage,
  SandboxResponse,
  SandboxToParentMessage,
} from "./protocol";

/**
 * Build a minimal bidirectional `postMessage` bridge that:
 *  - exposes a `SandboxIframeWindow` that the production code uses to
 *    talk *to* the iframe, and
 *  - lets the test dispatch synthetic `MessageEvent`s into the (real)
 *    global `window` to simulate the iframe talking *back*.
 *
 * The bridge is sufficient for end-to-end RPC tests without spinning
 * up a JSDOM iframe.
 */
const createFakeIframeBridge = (
  handleParentMessage: (
    message: ParentToSandboxMessage,
    respond: (reply: SandboxToParentMessage) => void,
  ) => void,
) => {
  const iframeWindow: SandboxIframeWindow = {
    postMessage: (message) => {
      const respond = (reply: SandboxToParentMessage) => {
        const event = new MessageEvent("message", {
          data: reply,
          source: iframeWindow as unknown as MessageEventSource,
        });
        window.dispatchEvent(event);
      };
      handleParentMessage(message as ParentToSandboxMessage, respond);
    },
  };
  return { iframeWindow };
};

describe("createIframeCoreSandbox", () => {
  it("buffers requests until the iframe announces `ready`", async () => {
    const received: ParentToSandboxMessage[] = [];
    const { iframeWindow } = createFakeIframeBridge((message, respond) => {
      received.push(message);
      if (message.type === "request") {
        respond({
          type: "response",
          requestId: message.requestId,
          response: {
            kind: "createMetricEvaluator",
            evaluatorId: "ev-1",
          } as SandboxResponse,
        });
      }
    });

    const sandbox = createIframeCoreSandbox({ iframeWindow });
    try {
      // Fire a request before ready — it should be queued.
      const evaluatorPromise = sandbox.createMetricEvaluator({
        id: "m1",
        name: "noop",
        code: "return 0;",
      });

      // Nothing should have hit the iframe yet.
      expect(received).toHaveLength(0);

      // Now signal ready and let the queue flush.
      const readyEvent = new MessageEvent("message", {
        data: { type: "ready" } satisfies SandboxToParentMessage,
        source: iframeWindow as unknown as MessageEventSource,
      });
      window.dispatchEvent(readyEvent);

      const evaluator = await evaluatorPromise;
      expect(evaluator).toBeTruthy();
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        type: "request",
        request: { kind: "createMetricEvaluator" },
      });
    } finally {
      sandbox.dispose();
    }
  });

  it("forwards `responseError` envelopes to the awaiting promise", async () => {
    const { iframeWindow } = createFakeIframeBridge((message, respond) => {
      if (message.type === "request") {
        respond({
          type: "responseError",
          requestId: message.requestId,
          error: serializeError(new Error("kaboom")),
        });
      }
    });

    const sandbox = createIframeCoreSandbox({ iframeWindow });
    try {
      const readyEvent = new MessageEvent("message", {
        data: { type: "ready" } satisfies SandboxToParentMessage,
        source: iframeWindow as unknown as MessageEventSource,
      });
      window.dispatchEvent(readyEvent);

      await expect(
        sandbox.createMetricEvaluator({
          id: "m1",
          name: "noop",
          code: "return 0;",
        }),
      ).rejects.toThrow(/kaboom/);
    } finally {
      sandbox.dispose();
    }
  });

  it("`onUncaughtError` fires for sandbox-pushed errors", async () => {
    const errors: Array<{ error: Error; origin: string }> = [];
    const { iframeWindow } = createFakeIframeBridge(() => {});

    const sandbox = createIframeCoreSandbox({
      iframeWindow,
      onUncaughtError: (error, origin) => {
        errors.push({ error, origin });
      },
    });
    try {
      const event = new MessageEvent("message", {
        data: {
          type: "uncaughtError",
          origin: "sandbox",
          error: serializeError(new Error("oops")),
        } satisfies SandboxToParentMessage,
        source: iframeWindow as unknown as MessageEventSource,
      });
      window.dispatchEvent(event);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.error.message).toBe("oops");
      expect(errors[0]!.origin).toBe("sandbox");
    } finally {
      sandbox.dispose();
    }
  });

  it("ignores messages whose `source` isn't the configured iframe", async () => {
    const errors: Array<Error> = [];
    const { iframeWindow } = createFakeIframeBridge(() => {});
    const sandbox = createIframeCoreSandbox({
      iframeWindow,
      onUncaughtError: (error) => {
        errors.push(error);
      },
    });
    try {
      // Different `source` — should be ignored.
      const event = new MessageEvent("message", {
        data: {
          type: "uncaughtError",
          origin: "sandbox",
          error: serializeError(new Error("forged")),
        } satisfies SandboxToParentMessage,
        source: window as unknown as MessageEventSource,
      });
      window.dispatchEvent(event);
      expect(errors).toHaveLength(0);
    } finally {
      sandbox.dispose();
    }
  });

  it("`dispose` rejects pending requests with a disposed error", async () => {
    const { iframeWindow } = createFakeIframeBridge(() => {
      // Never respond — the request is rejected via dispose() below.
    });
    const sandbox = createIframeCoreSandbox({ iframeWindow });
    const readyEvent = new MessageEvent("message", {
      data: { type: "ready" } satisfies SandboxToParentMessage,
      source: iframeWindow as unknown as MessageEventSource,
    });
    window.dispatchEvent(readyEvent);

    const promise = sandbox.createMetricEvaluator({
      id: "m1",
      name: "noop",
      code: "return 0;",
    });

    sandbox.dispose();

    await expect(promise).rejects.toThrow(/disposed/);
  });
});
