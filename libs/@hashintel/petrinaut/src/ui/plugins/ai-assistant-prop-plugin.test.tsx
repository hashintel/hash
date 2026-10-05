/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";

import { Petrinaut, type PetrinautAiAssistant } from "../petrinaut";
import { createAssistantPlugin } from "./create-assistant-plugin";

import type { PetrinautAiTransport } from "../views/Editor/panels/ai-assistant-panel/types";

vi.mock("../views/Editor/editor-view", async () => {
  const { useActiveAssistantContent, useInstalledAssistants } =
    await import("./plugin-assistants");

  return {
    EditorView: () => {
      const active = useActiveAssistantContent();
      const installed = useInstalledAssistants();

      return (
        <>
          <output aria-label="Installed assistants">
            {installed
              .map(({ pluginId, label }) => `${pluginId}:${label}`)
              .join(",")}
          </output>
          <output aria-label="Active assistant">
            {active === null
              ? "none"
              : `${active.pluginId}:${active.chat.conversationId ?? ""}`}
          </output>
          <output aria-label="Assistant tabs">
            {active?.tabs
              .map(
                ({ id, label, activityIdentities, mark }) =>
                  `${id}:${label}:${activityIdentities?.join("|") ?? "-"}:${mark === undefined ? "plain" : "marked"}`,
              )
              .join(",")}
          </output>
        </>
      );
    },
  };
});

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class WorkerStub extends EventTarget {
  onerror = null;
  onmessage = null;
  onmessageerror = null;

  postMessage() {}
  terminate() {}
}

globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
globalThis.Worker = WorkerStub as unknown as typeof Worker;

const transport: PetrinautAiTransport = {
  sendMessages: vi.fn<PetrinautAiTransport["sendMessages"]>(),
  reconnectToStream: () => Promise.resolve(null),
};

const createHandle = () =>
  createJsonDocHandle({
    initial: {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
  });

const legacy = (conversationId: string): PetrinautAiAssistant => ({
  conversationId,
  primaryLabel: "Chat",
  presentation: "brunch",
  additionalTab: {
    label: "Ledger",
    content: <p>Ledger body</p>,
    activityIdentities: ["revision-1"],
  },
  transport,
});

const other = createAssistantPlugin({
  id: "test.other",
  label: "Other",
  assistant: { conversationId: "other", transport },
});

const output = (name: string) =>
  screen.getByRole("status", { name }).textContent;

afterEach(cleanup);

describe("the aiAssistant prop", () => {
  test("runs as the default assistant, before the plugins, with its tab", () => {
    const handle = createHandle();
    render(
      <Petrinaut
        handle={handle}
        aiAssistant={legacy("legacy")}
        plugins={[other]}
      />,
    );

    expect(output("Installed assistants")).toBe(
      "petrinaut.ai-assistant-prop:AI,test.other:Other",
    );
    expect(output("Active assistant")).toBe(
      "petrinaut.ai-assistant-prop:legacy",
    );
    expect(output("Assistant tabs")).toBe(
      "additional-tab:Ledger:revision-1:marked",
    );
  });

  test("shows a new configuration without replacing the plugin", async () => {
    const handle = createHandle();
    const { rerender } = render(
      <Petrinaut handle={handle} aiAssistant={legacy("first")} />,
    );

    rerender(<Petrinaut handle={handle} aiAssistant={legacy("second")} />);

    // The host republishes in its commit; the view catches up right after it.
    await waitFor(() =>
      expect(output("Active assistant")).toBe(
        "petrinaut.ai-assistant-prop:second",
      ),
    );
  });

  test("leaves the first plugin assistant the default without the prop", () => {
    const handle = createHandle();
    render(<Petrinaut handle={handle} plugins={[other]} />);

    expect(output("Active assistant")).toBe("test.other:other");
  });
});
