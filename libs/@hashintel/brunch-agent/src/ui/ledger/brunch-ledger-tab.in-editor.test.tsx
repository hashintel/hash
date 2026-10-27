/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { parseLedgerComments } from "@hashintel/brunch-agent";
import { createJsonDocHandle, toPetrinautId } from "@hashintel/petrinaut-core";
import { Petrinaut } from "@hashintel/petrinaut/ui";

import { fixedBrunchAssistant } from "../chat/testing/fixed-brunch-assistant";
import {
  brunchPlugin,
  BrunchAssistantContext,
  type BrunchEditorApi,
  WithBrunchEditorApi,
} from "../editor-api-plugin";
import {
  InProcessLspWorker,
  NoopResizeObserver,
} from "../testing/petrinaut-jsdom";
import { pendingCommentsFor } from "./brunch-ledger-comments";
import { BrunchLedgerCommentsBar } from "./brunch-ledger-comments-bar";
import { BrunchLedgerTab } from "./brunch-ledger-tab";

import type { PetrinautAiAssistant } from "../chat/petrinaut";
import type { LedgerHistoryMessage } from "@hashintel/brunch-agent";
import type { UIMessageChunk } from "ai";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../testing/petrinaut-jsdom");
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
      content: (
        <BrunchLedgerTab conversationId="conversation" messages={messages} />
      ),
    },
  };
  render(
    <BrunchAssistantContext value={fixedBrunchAssistant(aiAssistant)}>
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

test("after a version load, the Ledger marks the reflection on an element the open net lacks", async () => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  Element.prototype.scrollIntoView = vi.fn();
  const overflowReflection = {
    id: "assistant-2",
    role: "assistant",
    purpose: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "ledger_commit",
        toolCallId: "ledger-2",
        state: "output-available",
        input: {
          entries: [
            [
              "reflection/create",
              {
                text: "The Overflow place holds what the reservoir sheds.",
                netElements: [{ kind: "place", id: "overflow" }],
                entities: ["e1"],
              },
            ],
          ],
        },
        output: {
          status: "recorded",
          commitId: "ledger-2",
          revision: 2,
          ids: ["r2"],
        },
      },
    ],
  } satisfies LedgerHistoryMessage;
  const aiAssistant: PetrinautAiAssistant = {
    messages: [],
    transport: {
      reconnectToStream: () => Promise.resolve(null),
      sendMessages: () => Promise.resolve(new ReadableStream<UIMessageChunk>()),
    },
    additionalTab: {
      label: "Ledger",
      content: (
        <BrunchLedgerTab
          conversationId="conversation"
          messages={[...messages, overflowReflection]}
          versionLoaded
        />
      ),
    },
  };
  render(
    <BrunchAssistantContext value={fixedBrunchAssistant(aiAssistant)}>
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
  await act(async () =>
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Show Brunch’s reflections",
      }),
    ),
  );
  const reflectionItem = async (text: string) =>
    (await screen.findByText(text)).closest("li");
  const overflowItem = await reflectionItem(
    "The Overflow place holds what the reservoir sheds.",
  );
  expect(overflowItem?.textContent).toContain("not in this version");
  // The latest turn's change marks still apply to the marked reflection.
  expect(
    overflowItem?.querySelector<HTMLElement>("[data-ledger-change]")?.dataset
      .ledgerChange,
  ).toBe("added");
  expect(
    (
      await reflectionItem(
        "The Reservoir place stands in for the stored volume.",
      )
    )?.textContent,
  ).not.toContain("not in this version");
});

test("the Ledger reviews without the chat composer, keeping its comments, Stop and the Chat draft", async () => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  Element.prototype.scrollIntoView = vi.fn();
  const sent: string[] = [];
  const aborted: boolean[] = [];
  let editorNet: BrunchEditorApi["document"]["net"] | undefined;
  const aiAssistant: PetrinautAiAssistant = {
    conversationId: "conversation",
    messages: [],
    presentation: "brunch",
    primaryLabel: "Chat",
    transport: {
      reconnectToStream: () => Promise.resolve(null),
      // Holds the response open until the panel aborts it.
      sendMessages: ({ messages: sentMessages, abortSignal }) => {
        const last = sentMessages.at(-1);
        sent.push(
          last?.parts
            .flatMap((part) => (part.type === "text" ? [part.text] : []))
            .join("") ?? "",
        );
        return Promise.resolve(
          new ReadableStream<UIMessageChunk>({
            start: (controller) => {
              abortSignal?.addEventListener("abort", () => {
                aborted.push(true);
                controller.close();
              });
            },
          }),
        );
      },
    },
    renderComposerControl: (context) => (
      <WithBrunchEditorApi>
        {(api) => {
          editorNet = api.document.net;
          return (
            <BrunchLedgerCommentsBar context={context} net={api.document.net} />
          );
        }}
      </WithBrunchEditorApi>
    ),
    additionalTab: {
      label: "Ledger",
      content: (
        <BrunchLedgerTab conversationId="conversation" messages={messages} />
      ),
    },
  };
  render(
    <BrunchAssistantContext value={fixedBrunchAssistant(aiAssistant)}>
      <Petrinaut
        handle={createJsonDocHandle({
          initial: { places: [], transitions: [] },
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
  const composer = await screen.findByRole("textbox", {
    name: "Message AI assistant",
  });
  fireEvent.change(composer, { target: { value: "Unsent draft" } });
  const ledgerTab = screen.getByRole("tab", { name: /Ledger/u });
  await act(async () => fireEvent.click(ledgerTab));

  expect(ledgerTab.getAttribute("aria-selected")).toBe("true");
  expect(
    screen.queryByRole("textbox", { name: "Message AI assistant" }),
  ).toBeNull();

  // An explicit Ledger comment still sends from the Ledger tab, as its own turn.
  if (editorNet === undefined) throw new Error("The editor net never rendered");
  const comments = pendingCommentsFor(editorNet, "conversation");
  act(() => {
    comments.add({ records: ["e1"], text: "Is this the only reservoir?" });
  });
  const commentsBar = await screen.findByRole("group", {
    name: "Ledger comments",
  });
  await act(async () =>
    fireEvent.click(within(commentsBar).getByRole("button", { name: "Send" })),
  );
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(parseLedgerComments(sent[0] ?? "")?.[0]?.text).toBe(
    "Is this the only reservoir?",
  );

  // The running turn can still be stopped from the Ledger.
  const stop = await screen.findByRole("button", { name: "Stop AI response" });
  expect(
    screen.queryByRole("textbox", { name: "Message AI assistant" }),
  ).toBeNull();
  await act(async () => fireEvent.click(stop));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Stop AI response" }),
    ).toBeNull(),
  );
  expect(aborted).toEqual([true]);
  expect(ledgerTab.getAttribute("aria-selected")).toBe("true");

  // Chat keeps the conversation and the unsent draft.
  await act(async () =>
    fireEvent.click(screen.getByRole("tab", { name: /Chat/u })),
  );
  expect(
    (
      screen.getByRole("textbox", {
        name: "Message AI assistant",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Unsent draft");
  expect(sent).toHaveLength(1);
});

const ledgerCall = (
  toolCallId: string,
  entries: unknown[],
  ids: string[],
  settled = true,
): LedgerHistoryMessage => ({
  id: `assistant-${toolCallId}`,
  role: "assistant",
  purpose: "assistant",
  parts: [
    {
      type: "dynamic-tool",
      toolName: "ledger_commit",
      toolCallId,
      state: settled ? "output-available" : "input-available",
      input: { entries },
      ...(settled
        ? {
            output: {
              status: "recorded",
              commitId: toolCallId,
              revision: 1,
              ids,
            },
          }
        : {}),
    },
  ],
});

const boosterPump = [
  "entity/create",
  {
    name: "Booster pump",
    kind: "resource",
    origin: "stated",
    status: "confirmed",
  },
];

test("the Ledger marks the latest turn's changes as they are accepted, and keeps them across tab switches", async () => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  Element.prototype.scrollIntoView = vi.fn();
  const secondTurn: LedgerHistoryMessage[] = [
    ...messages,
    {
      id: "user-2",
      role: "user",
      purpose: "user",
      parts: [{ type: "text", text: "A booster pump fills it." }],
    },
  ];
  const handle = createJsonDocHandle({
    initial: { places: [], transitions: [] },
  });
  const editor = (history: LedgerHistoryMessage[], highlightChanges = true) => (
    <BrunchAssistantContext
      value={fixedBrunchAssistant({
        messages: [],
        presentation: "brunch",
        primaryLabel: "Chat",
        transport: {
          reconnectToStream: () => Promise.resolve(null),
          sendMessages: () =>
            Promise.resolve(new ReadableStream<UIMessageChunk>()),
        },
        additionalTab: {
          label: "Ledger",
          content: (
            <BrunchLedgerTab
              conversationId="conversation"
              messages={history}
              highlightChanges={highlightChanges}
            />
          ),
        },
      })}
    >
      <Petrinaut handle={handle} plugins={[brunchPlugin]} />
    </BrunchAssistantContext>
  );
  const marks = () =>
    [
      ...screen
        .getByTestId("brunch-ledger-document")
        .querySelectorAll<HTMLElement>("[data-ledger-change]"),
    ].map(({ dataset }) => `${dataset.ledgerAddress} ${dataset.ledgerChange}`);

  const { rerender } = render(editor(secondTurn));
  await act(async () =>
    fireEvent.click(
      await screen.findByRole("button", { name: "Show AI assistant" }),
    ),
  );
  await act(async () =>
    fireEvent.click(await screen.findByRole("tab", { name: /Ledger/u })),
  );
  // The second turn has opened and changed nothing yet.
  expect(marks()).toEqual([]);

  // While the response runs, each accepted commit adds to the marks; a call
  // still pending adds nothing.
  const pumpAdded = [
    ...secondTurn,
    ledgerCall("ledger-2", [boosterPump], ["e2"]),
  ];
  rerender(editor([...pumpAdded, ledgerCall("ledger-3", [], [], false)]));
  expect(marks()).toEqual(["e2 added"]);
  const renamed = [
    ...pumpAdded,
    ledgerCall(
      "ledger-3",
      [
        [
          "entity/update/e1",
          {
            name: "Hillcrest reservoir",
            kind: "resource",
            origin: "stated",
            status: "confirmed",
          },
        ],
      ],
      ["e1"],
    ),
  ];
  rerender(editor(renamed));
  expect(marks()).toEqual(["e1 updated", "e2 added"]);

  await act(async () =>
    fireEvent.click(screen.getByRole("tab", { name: /Chat/u })),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("tab", { name: /Ledger/u })),
  );
  expect(marks()).toEqual(["e1 updated", "e2 added"]);

  // Once the user submits again, the marks clear while the records stay.
  rerender(editor(renamed, false));
  expect(marks()).toEqual([]);
  expect(screen.getByTestId("brunch-ledger-document").textContent).toContain(
    "Booster pump",
  );
});
