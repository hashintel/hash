/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { renderEditorWith } from "../_shared/testing/render-editor-with";
import { walkthroughPlugin } from "./plugin";

import type { PetrinautAiAssistant } from "@hashintel/petrinaut/ui";
import type { UIMessageChunk } from "ai";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const aiAssistant: PetrinautAiAssistant = {
  transport: {
    reconnectToStream: () => Promise.resolve(null),
    sendMessages: () =>
      Promise.resolve(
        new ReadableStream<UIMessageChunk>({
          start(controller) {
            controller.close();
          },
        }),
      ),
  },
};

test("the guide opens with the editor and, once skipped, stays closed the next time", async () => {
  renderEditorWith(walkthroughPlugin);
  fireEvent.click(await screen.findByRole("button", { name: "Skip tour" }));
  expect(screen.queryByRole("dialog")).toBeNull();

  cleanup();
  renderEditorWith(walkthroughPlugin);
  await screen.findByRole("button", { name: "Menu" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("switching the setting back on opens the guide only the next time the editor opens", async () => {
  renderEditorWith(walkthroughPlugin);
  fireEvent.click(await screen.findByRole("button", { name: "Skip tour" }));

  fireEvent.keyDown(window, { key: ",", metaKey: true });
  const setting = await screen.findByRole("checkbox", {
    name: "Show welcome guide",
  });
  await act(async () => fireEvent.click(setting));
  expect(
    screen.queryByRole("button", { name: "Skip tour", hidden: true }),
  ).toBeNull();

  cleanup();
  renderEditorWith(walkthroughPlugin);
  await screen.findByRole("button", { name: "Skip tour" });
});

test("the open guide holds back the empty-net assistant prompt", async () => {
  const name = "Describe the process you want to create";
  renderEditorWith(walkthroughPlugin, { aiAssistant });

  const skip = await screen.findByRole("button", { name: "Skip tour" });
  // The modal guide hides the rest of the page from the accessibility tree.
  expect(screen.queryByRole("textbox", { name, hidden: true })).toBeNull();

  fireEvent.click(skip);
  await screen.findByRole("textbox", { name });
});
