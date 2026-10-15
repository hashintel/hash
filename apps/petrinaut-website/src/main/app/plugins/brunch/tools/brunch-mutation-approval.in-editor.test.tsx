/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { ErrorTrackerContext } from "@hashintel/petrinaut/react";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import {
  InProcessLspWorker,
  NoopResizeObserver,
} from "../../../shared/petrinaut-jsdom";
import { brunchPlugin } from "../editor-api-plugin";
import {
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalInteractiveTools,
} from "./brunch-mutation-approval";

import type {
  PetrinautAiAssistant,
  PetrinautAiMessage,
} from "@hashintel/petrinaut/ui";
import type { PetrinautPlugin } from "@hashintel/petrinaut/ui/plugin";
import type { UIMessageChunk } from "ai";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../../../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

beforeAll(async () => {
  // Settle the editor's import and theme setup before mounting.
  const monaco = await import("monaco-editor");
  monaco.editor.setTheme("vs");
}, 30_000);

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// Brunch's calls arrive as dynamic tools, which the editor leaves to the host:
// a static `tool-deleteItemsByIds` part is one the editor runs itself.
const pendingRemoval: PetrinautAiMessage = {
  id: "assistant-1",
  role: "assistant",
  parts: [
    {
      type: "dynamic-tool",
      toolName: "deleteItemsByIds",
      toolCallId: "delete-1",
      state: "input-available",
      input: { items: [{ type: "place", id: "queue" }] },
    },
  ],
};

// A turn that stays open, as a real one does while the user decides. If the
// call ever settled without them, a stream that closed at once would let the
// editor's chat send again in a loop that starves the test's timers.
const openStream = () => Promise.resolve(new ReadableStream<UIMessageChunk>());

/**
 * Opens the real editor's assistant on one destructive call waiting for
 * approval, with `plugins` installed.
 */
const openPendingApproval = async (plugins: readonly PetrinautPlugin[]) => {
  // Kept until the environment is disposed: the language server starts lazily.
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  const coordinator = createBrunchMutationApprovalCoordinator();
  coordinator.open();
  void coordinator.request({
    toolCallId: "delete-1",
    toolName: "deleteItemsByIds",
    signal: new AbortController().signal,
  });
  const aiAssistant: PetrinautAiAssistant = {
    interactiveTools: createBrunchMutationApprovalInteractiveTools(coordinator),
    messages: [pendingRemoval],
    transport: {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: openStream,
    },
  };
  const captureException = vi.fn();
  render(
    <ErrorTrackerContext value={{ captureException }}>
      <Petrinaut
        aiAssistant={aiAssistant}
        handle={createJsonDocHandle({
          initial: { places: [], transitions: [] },
        })}
        plugins={plugins}
      />
    </ErrorTrackerContext>,
  );
  const showAssistant = await screen.findByRole("button", {
    name: "Show AI assistant",
  });
  await act(async () => fireEvent.click(showAssistant));
  return { captureException };
};

test("with the Brunch plugin, a waiting removal shows its approval", async () => {
  const { captureException } = await openPendingApproval([brunchPlugin]);

  expect(await screen.findByRole("button", { name: "Allow" })).not.toBeNull();
  expect(captureException).not.toHaveBeenCalled();
});

test("without the Brunch plugin, the approval says why it can't show and reports it", async () => {
  const { captureException } = await openPendingApproval([]);

  // Plain queries: a failing `findBy` prints the whole editor's DOM.
  await vi.waitFor(() =>
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
      source: "brunch.editor-plugin",
    }),
  );
  expect(
    screen
      .queryByText(/its editor plugin isn’t running/u)
      ?.getAttribute("role"),
  ).toBe("alert");
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
});
