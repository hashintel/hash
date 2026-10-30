/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { use, useMemo } from "react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { ErrorTrackerContext } from "@hashintel/petrinaut/react";
import { Petrinaut } from "@hashintel/petrinaut/ui";
import {
  definePetrinautPlugin,
  type PetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import {
  InProcessLspWorker,
  NoopResizeObserver,
} from "../../../shared/petrinaut-jsdom";
import { AiAssistantPanel } from "../chat/ai-assistant-panel";
import { fixedBrunchAssistant } from "../chat/testing/fixed-brunch-assistant";
import { brunchPlugin, BrunchAssistantContext } from "../editor-api-plugin";
import {
  createBrunchMutationApprovalComponents,
  createBrunchMutationApprovalCoordinator,
  createBrunchMutationApprovalInteractiveTools,
  useBrunchMutationApprovalTools,
  type BrunchMutationApprovalCoordinator,
} from "./brunch-mutation-approval";

import type { PetrinautAiMessage } from "../chat/ai-assistant-panel";
import type { PetrinautAiAssistant } from "../chat/petrinaut";
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

const ChatWithoutBrunchPlugin = definePetrinautPlugin({
  id: "test.chat-without-brunch",
  name: "Brunch's chat without its plugin",
  description: "Renders Brunch's chat as another plugin's assistant.",
  author: "HASH",
  access: { document: "write", experiments: "write", editor: "write" },
  assistant: true,
});

const useChatWithoutBrunchPlugin: PluginHook<typeof ChatWithoutBrunchPlugin> = (
  api,
) => {
  const assistant = use(BrunchAssistantContext)?.assistant ?? null;
  if (assistant === null) throw new Error("No assistant to render");
  return {
    assistant: {
      content: <AiAssistantPanel aiAssistant={assistant} api={api} />,
    },
  };
};

/**
 * Brunch's chat with the Brunch plugin left out, which production never does:
 * the only way its cards can render without the plugin's `api`.
 */
const chatWithoutBrunchPlugin = ChatWithoutBrunchPlugin(
  useChatWithoutBrunchPlugin,
);

/**
 * Opens the real editor's assistant on one destructive call waiting for
 * approval, with `plugins` installed and Brunch's assistant bridged to them
 * as the demo shell bridges it.
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
    interactiveTools: createBrunchMutationApprovalInteractiveTools(
      createBrunchMutationApprovalComponents(coordinator),
      coordinator.getPendingSnapshot(),
    ),
    messages: [pendingRemoval],
    transport: {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: openStream,
    },
  };
  const captureException = vi.fn();
  render(
    <ErrorTrackerContext value={{ captureException }}>
      <BrunchAssistantContext value={fixedBrunchAssistant(aiAssistant)}>
        <Petrinaut
          handle={createJsonDocHandle({
            initial: { places: [], transitions: [] },
          })}
          plugins={plugins}
        />
      </BrunchAssistantContext>
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
  const { captureException } = await openPendingApproval([
    chatWithoutBrunchPlugin,
  ]);

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

// Two removals in one step, as Brunch sends them: the second asks for approval
// only after the first was allowed, while the stream is quiet.
const twoRemovals: PetrinautAiMessage = {
  id: "assistant-2",
  role: "assistant",
  parts: ["remove-1", "remove-2"].map((toolCallId, index) => ({
    type: "dynamic-tool" as const,
    toolName: "removePlace",
    toolCallId,
    state: "input-available" as const,
    input: { placeId: `place-${index + 1}` },
  })),
};

const ApprovingEditor = ({
  coordinator,
}: {
  coordinator: BrunchMutationApprovalCoordinator;
}) => {
  const interactiveTools = useBrunchMutationApprovalTools(coordinator);
  const aiAssistant = useMemo<PetrinautAiAssistant>(
    () => ({
      interactiveTools,
      messages: [twoRemovals],
      transport: {
        reconnectToStream: () => Promise.resolve(null),
        sendMessages: openStream,
      },
    }),
    [interactiveTools],
  );
  const handle = useMemo(
    () => createJsonDocHandle({ initial: { places: [], transitions: [] } }),
    [],
  );
  return (
    <BrunchAssistantContext value={fixedBrunchAssistant(aiAssistant)}>
      <Petrinaut handle={handle} plugins={[brunchPlugin]} />
    </BrunchAssistantContext>
  );
};

test("a removal that starts waiting after an earlier one was allowed still shows its approval", async () => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  const coordinator = createBrunchMutationApprovalCoordinator();
  coordinator.open();
  render(
    <ErrorTrackerContext value={{ captureException: vi.fn() }}>
      <ApprovingEditor coordinator={coordinator} />
    </ErrorTrackerContext>,
  );
  await act(async () =>
    fireEvent.click(
      await screen.findByRole("button", { name: "Show AI assistant" }),
    ),
  );
  const request = (toolCallId: string) =>
    coordinator.request({
      toolCallId,
      toolName: "removePlace",
      signal: new AbortController().signal,
    });

  let first: ReturnType<typeof request> | undefined;
  act(() => {
    first = request("remove-1");
  });
  await act(async () =>
    fireEvent.click(await screen.findByRole("button", { name: "Allow" })),
  );
  await expect(first).resolves.toEqual({ decision: "allow" });
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();

  act(() => {
    void request("remove-2");
  });
  expect(await screen.findByRole("button", { name: "Allow" })).not.toBeNull();
  coordinator.close();
});
