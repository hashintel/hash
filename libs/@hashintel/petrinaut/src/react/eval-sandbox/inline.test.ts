// @vitest-environment jsdom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { createInlineSandbox } from "./inline";

describe("createInlineSandbox", () => {
  it("provides a working metric evaluator (delegates to core)", async () => {
    const sandbox = createInlineSandbox();
    try {
      const evaluator = await sandbox.createMetricEvaluator({
        id: "m1",
        name: "Tokens in A",
        code: "return state.places.A.count;",
      });
      const result = await evaluator.evaluate({
        places: { A: { count: 3, tokens: [] } },
      });
      expect(result).toBe(3);
    } finally {
      sandbox.dispose();
    }
  });

  it("`createVisualizerHost` mounts a React tree into the container", async () => {
    const sandbox = createInlineSandbox();
    try {
      const host = sandbox.createVisualizerHost();
      const container = document.createElement("div");
      document.body.appendChild(container);
      let handle: ReturnType<typeof host.mount>;
      await act(async () => {
        handle = host.mount({
          container,
          code: [
            "export default Visualization(({ tokens }) => {",
            "  return <span data-testid='count'>{tokens.length}</span>;",
            "});",
          ].join("\n"),
          props: {
            tokens: [{ x: 1 }, { x: 2 }],
            parameters: {},
          },
        });
      });
      expect(container.textContent).toContain("2");

      await act(async () => {
        handle.setProps({
          tokens: [{ x: 1 }, { x: 2 }, { x: 3 }],
          parameters: {},
        });
      });
      expect(container.textContent).toContain("3");

      await act(async () => {
        handle.dispose();
      });
      document.body.removeChild(container);
    } finally {
      sandbox.dispose();
    }
  });

  it("`onError` fires when the visualizer code fails to compile", async () => {
    const onError = vi.fn();
    const sandbox = createInlineSandbox({ onError });
    try {
      const host = sandbox.createVisualizerHost();
      const container = document.createElement("div");
      document.body.appendChild(container);

      // Suppress console.error noise from the inline host's compile path.
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const handle = host.mount({
        container,
        code: "this is not valid javascript at all (",
        props: { tokens: [], parameters: {} },
      });

      // The compile error fires synchronously inside `mount`.
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);

      handle.dispose();
      document.body.removeChild(container);
      consoleSpy.mockRestore();
    } finally {
      sandbox.dispose();
    }
  });
});
