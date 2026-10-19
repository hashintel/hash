/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { createUIMessageStreamResponse, type UIMessageChunk } from "ai";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import {
  InProcessLspWorker,
  preloadLanguageServer,
} from "../../shared/petrinaut-jsdom";
import { renderEditorWith } from "../_shared/testing/render-editor-with";
import { petrinautAiPlugin } from "./plugin";

import type { PetrinautAiMessage } from "../_shared/chat/ai-message";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

// Kept until the environment is disposed, as `renderEditorWith` keeps it.
beforeAll(async () => {
  vi.stubGlobal("Worker", InProcessLspWorker);
  await preloadLanguageServer();
}, 30_000);

afterEach(cleanup);

const respond = (chunks: UIMessageChunk[]) =>
  createUIMessageStreamResponse({
    stream: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
  });

test("the empty-net prompt starts a chat that edits the net, saving the transcript under the document's id", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      respond([
        { type: "start" },
        { type: "start-step" },
        {
          type: "tool-input-available",
          toolCallId: "add-queue",
          toolName: "addPlace",
          input: {
            id: "queue",
            name: "Queue",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 0,
            y: 0,
          },
        },
        { type: "finish-step" },
        { type: "finish" },
      ]),
    )
    .mockResolvedValueOnce(
      respond([
        { type: "start-step" },
        { type: "text-start", id: "done" },
        { type: "text-delta", id: "done", delta: "Added the queue." },
        { type: "text-end", id: "done" },
        { type: "finish-step" },
        { type: "finish" },
      ]),
    );
  vi.stubGlobal("fetch", fetch);
  const { handle } = renderEditorWith([petrinautAiPlugin]);

  fireEvent.change(
    await screen.findByRole("textbox", {
      name: "Describe the process you want to create",
    }),
    { target: { value: "A queue" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Send first AI assistant message" }),
  );

  // Two requests and the window's first mount can outlast the default wait.
  await screen.findByText("Added the queue.", {}, { timeout: 4_000 });
  expect(fetch).toHaveBeenCalledTimes(2);
  // Each request goes to the stock endpoint with its own correlation id.
  const [url, init] = fetch.mock.calls[0]!;
  expect(url).toBe("/api/chat");
  expect(new Headers(init?.headers).get("x-request-id")).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
  expect(handle.doc()?.places.map(({ name }) => name)).toEqual(["Queue"]);
  const stored = JSON.parse(
    localStorage.getItem("petrinaut-ai-messages") ?? "{}",
  ) as Record<string, PetrinautAiMessage[]>;
  expect(Object.keys(stored)).toEqual([handle.id]);
  expect(stored[handle.id]?.flatMap(({ parts }) => parts)).toContainEqual(
    expect.objectContaining({
      toolCallId: "add-queue",
      output: expect.objectContaining({ applied: true }) as unknown,
    }),
  );
});
