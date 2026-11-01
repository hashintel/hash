/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { createJsonDocHandle, toPetrinautId } from "@hashintel/petrinaut-core";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import {
  InProcessLspWorker,
  NoopResizeObserver,
} from "../../../shared/petrinaut-jsdom";
import { brunchPlugin, BrunchAssistantContext } from "../editor-api-plugin";
import { BrunchLedgerTab } from "./brunch-ledger-tab";

import type { PetrinautAiAssistant } from "../chat/petrinaut";
import type { LedgerHistoryMessage } from "@hashintel/brunch-agent";
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

const reservoirId = toPetrinautId("reservoir");

/** One accepted commit: the reservoir and a reflection naming its place by the id Brunch wrote. */
const messages: LedgerHistoryMessage[] = [
  {
    id: "user-1",
    role: "user",
    purpose: "user",
    parts: [{ type: "text", text: "The reservoir holds a day of supply." }],
  },
  {
    id: "assistant-1",
    role: "assistant",
    purpose: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "ledger_commit",
        toolCallId: "ledger-1",
        state: "output-available",
        input: {
          entries: [
            [
              "entity/create",
              {
                name: "Hillcrest service reservoir",
                kind: "resource",
                origin: "stated",
                status: "confirmed",
              },
            ],
            [
              "reflection/create",
              {
                text: "The Reservoir place stands in for the stored volume.",
                netElements: [{ kind: "place", id: "reservoir" }],
                entities: ["$0"],
              },
            ],
          ],
        },
        output: {
          status: "recorded",
          commitId: "ledger-1",
          revision: 1,
          ids: ["e1", "r1"],
        },
      },
    ],
  },
];

test("a reflection's net elements become the editor's selection, which the Ledger then explains", async () => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  Element.prototype.scrollIntoView = vi.fn();
  const aiAssistant: PetrinautAiAssistant = {
    messages: [],
    transport: {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: () => Promise.resolve(new ReadableStream<UIMessageChunk>()),
    },
    additionalTab: {
      label: "Ledger",
      content: <BrunchLedgerTab messages={messages} />,
    },
  };
  render(
    <BrunchAssistantContext value={aiAssistant}>
      <Petrinaut
        handle={createJsonDocHandle({
          initial: {
            places: [
              {
                id: reservoirId,
                name: "Reservoir",
                colorId: null,
                dynamicsEnabled: false,
                differentialEquationId: null,
                x: 0,
                y: 0,
              },
            ],
            transitions: [],
          },
        })}
        plugins={[brunchPlugin]}
      />
    </BrunchAssistantContext>,
  );
  await act(async () =>
    fireEvent.click(
      await screen.findByRole("button", { name: "Show AI assistant" }),
    ),
  );
  await act(async () =>
    fireEvent.click(await screen.findByRole("tab", { name: /Ledger/u })),
  );
  expect(
    screen.queryByRole("complementary", { name: "Basis of the selection" }),
  ).toBeNull();

  const reflectionsSwitch = await screen.findByRole("checkbox", {
    name: "Show Brunch’s reflections",
  });
  await act(async () => fireEvent.click(reflectionsSwitch));
  await act(async () =>
    fireEvent.click(await screen.findByRole("button", { name: "Show in net" })),
  );

  const basis = await screen.findByRole("complementary", {
    name: "Basis of the selection",
  });
  expect(basis.textContent).toContain(
    "The Reservoir place stands in for the stored volume.",
  );
});
