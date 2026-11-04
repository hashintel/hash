// @vitest-environment jsdom
import {
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { setProvider } from "@flue/runtime";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { loadBuiltBrunchApplication } from "@apps/brunch-agent/testing/load-built-application";
import { assistantSelectionStorageKey } from "@apps/petrinaut-website/src/main/app/local-storage-demo/assistant-selection";
import { LocalStorageDemoApp } from "@apps/petrinaut-website/src/main/app/local-storage-demo/local-storage-demo-app";
import {
  InProcessLspWorker,
  NoopResizeObserver,
  preloadMonaco,
} from "@hashintel/brunch-agent/testing/petrinaut-jsdom";
import { toPetrinautId } from "@hashintel/petrinaut-core";

import type { FlueClient } from "@flue/sdk";
import type { SDCPN } from "@hashintel/petrinaut-core";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("@hashintel/brunch-agent/testing/petrinaut-jsdom");
  installPetrinautDomShims();
});

const fixture = vi.hoisted(() => ({
  fetch: null as typeof fetch | null,
  client: null as FlueClient | null,
}));
vi.mock("@flue/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@flue/sdk")>();
  return {
    ...actual,
    createFlueClient: (
      options: Parameters<typeof actual.createFlueClient>[0],
    ) => {
      const client = actual.createFlueClient(options);
      // The server's own in-process history client passes its own fetch.
      if (options.fetch === undefined) fixture.client = client;
      return client;
    },
  };
});
vi.mock(
  "@apps/petrinaut-website/src/main/app/local-storage-demo/brunch-preview-config",
  () => ({
    resolveBrunchPreviewConfig: () => ({
      chatEndpoint: "/agents/petrinaut",
      isBrunchConfigured: true,
    }),
  }),
);
vi.mock(
  "@apps/petrinaut-website/src/main/app/local-storage-demo/brunch-owner-key",
  () => ({
    getOrCreateBrunchOwnerKey: () => "test-owner",
  }),
);

const originalFetch = globalThis.fetch;
beforeAll(async () => {
  await preloadMonaco();
  globalThis.fetch = (resource, options) => {
    const request =
      resource instanceof Request ? resource : new Request(resource, options);
    if (
      fixture.fetch &&
      new URL(request.url).pathname.startsWith("/agents/petrinaut/")
    )
      return fixture.fetch(request);
    return Promise.reject(new Error("External fetch forbidden"));
  };
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
}, 30_000);
afterEach(() => {
  cleanup();
  localStorage.clear();
});
afterAll(() => {
  globalThis.fetch = originalFetch;
});

const noResultLabel = "No result — response failed";
/** A non-transient provider error, so Flue settles the response `failed`. */
const providerFailure = {
  stopReason: "error",
  errorMessage: "400 Bad Request: invalid input",
} as const;

const initialDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const startServer = async (
  responses: Parameters<ReturnType<typeof fauxProvider>["setResponses"]>[0],
) => {
  process.env.BRUNCH_CHAT_MODEL = "openai/faux-model";
  process.env.BRUNCH_CHAT_THINKING = "medium";
  process.env.BRUNCH_DEV_DB_PATH = ":memory:";
  process.env.OTEL_SDK_DISABLED = "true";
  const faux = fauxProvider({
    provider: "openai",
    models: [{ id: "faux-model", reasoning: true }],
  });
  faux.setResponses(responses);
  const server = await loadBuiltBrunchApplication();
  setProvider(faux.provider);
  fixture.fetch = async (input, init) =>
    server.fetch(input instanceof Request ? input : new Request(input, init));
  return { server, faux };
};

const openPanel = async () => {
  const documentId = toPetrinautId("net-1");
  localStorage.setItem(assistantSelectionStorageKey, "brunch");
  localStorage.setItem(
    "petrinaut:plugin:website.walkthrough",
    JSON.stringify({ showOnInit: false }),
  );
  localStorage.setItem(
    "petrinaut-sdcpn",
    JSON.stringify({
      [documentId]: {
        id: documentId,
        revisionId: "initial-revision",
        title: "Queue",
        sdcpn: initialDefinition,
        lastUpdated: new Date(0).toISOString(),
      },
    }),
  );
  const view = render(
    <LocalStorageDemoApp
      netId={documentId}
      onOpenNet={() => {}}
      search={{}}
      onSearchChange={() => {}}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Show AI assistant" }),
  );
  return view;
};

const send = async (text: string) => {
  const composer = await screen.findByRole<HTMLTextAreaElement>("textbox", {
    name: "Message AI assistant",
  });
  fireEvent.change(composer, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
};

/** Each tool row's status and text, folded or not. */
const toolRows = () =>
  [...document.querySelectorAll("[data-tool-status]")].map((dot) => ({
    status: dot.getAttribute("data-tool-status"),
    busy: dot.closest("button")?.getAttribute("aria-busy") ?? null,
    text: dot.closest("button")?.textContent ?? "",
  }));

const rowContaining = (text: string) =>
  toolRows().find((row) => row.text.includes(text));

/** The failed call's row once the panel has its response's ending. */
const findNoResultRow = (text: string) =>
  waitFor(
    () => {
      const row = rowContaining(text);
      expect(row?.status).toBe("no-result");
      return row;
    },
    { timeout: 20_000 },
  );

const expectNotWaiting = () => {
  expect(screen.queryByRole("button", { name: "Stop AI response" })).toBeNull();
  expect(screen.queryByText("Waiting for your decision")).toBeNull();
  expect(screen.queryByText(/Running…|Preparing…/u)).toBeNull();
  expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
};

/** Flue's own record: the call stays unanswered and the response failed. */
const expectFailedWithUnansweredCall = async (toolCallId: string) => {
  const history = await fixture.client?.history();
  expect(history?.settlements.map(({ outcome }) => outcome)).toEqual([
    "failed",
  ]);
  const call = history?.messages
    .flatMap((message) => message.parts)
    .find(
      (part) => part.type === "dynamic-tool" && part.toolCallId === toolCallId,
    );
  expect(call).toMatchObject({ state: "input-available" });
};

test("a durable Stop after a tool result is not an empty reply", async () => {
  let waitingForReply = false;
  let releaseReply: (() => void) | undefined;
  const { server, faux } = await startServer([
    fauxAssistantMessage(
      [fauxToolCall("getLatestNetDefinition", {}, { id: "stopped-read" })],
      { stopReason: "toolUse" },
    ),
    async (_context, options) => {
      await new Promise<void>((resolve) => {
        releaseReply = resolve;
        options?.signal?.addEventListener("abort", () => resolve(), {
          once: true,
        });
        waitingForReply = true;
      });
      return fauxAssistantMessage([]);
    },
  ]);
  let unmount = () => {};
  try {
    ({ unmount } = await openPanel());
    await send("Read the net and reply.");
    await waitFor(
      () => {
        expect(rowContaining("Checked latest net definition")?.status).toBe(
          "ok",
        );
        expect(waitingForReply).toBe(true);
      },
      { timeout: 20_000 },
    );
    // Stop at the server boundary without the panel's local abort masking its stream.
    await act(async () => {
      await fixture.client?.abort();
    });
    await screen.findByText("Response stopped");
    await waitFor(expectNotWaiting);
    expect(screen.queryByText("No reply received")).toBeNull();
    expect(screen.queryByText("AI assistant error")).toBeNull();
    expect(faux.state.callCount).toBe(2);
  } finally {
    releaseReply?.();
    unmount();
    fixture.fetch = null;
    fixture.client = null;
    await server.stop();
  }
}, 60_000);

test.each(["empty", "text"] as const)(
  "a server-owned tool follow-up with %s output ends visibly and leaves the composer usable",
  async (replyKind) => {
    const reply = "The net is empty.";
    const { server, faux } = await startServer([
      fauxAssistantMessage(
        [fauxToolCall("getLatestNetDefinition", {}, { id: "empty-read" })],
        { stopReason: "toolUse" },
      ),
      fauxAssistantMessage(replyKind === "empty" ? [] : reply),
    ]);
    let unmount = () => {};
    try {
      ({ unmount } = await openPanel());
      await send("Read the net and finish.");
      await waitFor(
        () => {
          expect(rowContaining("Checked latest net definition")?.status).toBe(
            "ok",
          );
          expectNotWaiting();
          expect(faux.state.callCount).toBe(2);
          expect(
            screen.getByText(
              replyKind === "empty" ? "No reply received" : reply,
            ),
          ).toBeTruthy();
          expect(screen.queryAllByText("No reply received")).toHaveLength(
            replyKind === "empty" ? 1 : 0,
          );
        },
        { timeout: 20_000 },
      );
      expect(screen.queryByText("AI assistant error")).toBeNull();
      faux.setResponses([fauxAssistantMessage("A later message works.")]);
      await send("Please reply now.");
      await screen.findByText("A later message works.");
      await waitFor(expectNotWaiting);
      expect(screen.queryByText("No reply received")).toBeNull();
      expect(screen.queryByText("AI assistant error")).toBeNull();
      expect(faux.state.callCount).toBe(3);
    } finally {
      unmount();
      fixture.fetch = null;
      fixture.client = null;
      await server.stop();
    }
  },
  60_000,
);

test("a call left unanswered by a failed response reads as no result, live and reopened, beside the results it did get", async () => {
  const scenario = {
    id: "baseline",
    name: "Baseline",
    scenarioParameters: [],
    parameterOverrides: {},
    initialState: { type: "per_place" as const, content: {} },
  };
  const { server } = await startServer([
    fauxAssistantMessage(
      [fauxToolCall("readNetOutline", {}, { id: "outline-call" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [fauxToolCall("addScenario", scenario, { id: "scenario-call" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall(
          "removeScenario",
          { scenarioId: scenario.id },
          { id: "remove-scenario-call" },
        ),
      ],
      providerFailure,
    ),
  ]);
  let unmount = () => {};
  try {
    ({ unmount } = await openPanel());
    await send("Add then remove a baseline scenario.");

    const expectRemovalWithoutResult = async () => {
      const removal = await findNoResultRow("Removed scenario");
      expect(removal?.text).toContain(noResultLabel);
      expect(removal?.busy).toBeNull();
      expect(rowContaining("Added scenario Baseline")?.status).toBe("ok");
      await waitFor(expectNotWaiting);
    };
    await expectRemovalWithoutResult();
    unmount();
    ({ unmount } = await openPanel());
    await expectRemovalWithoutResult();
    await expectFailedWithUnansweredCall("remove-scenario-call");
  } finally {
    unmount();
    fixture.fetch = null;
    fixture.client = null;
    await server.stop();
  }
}, 60_000);

test("a draft card left unprepared by a failed response becomes a no-result row, live and reopened", async () => {
  const draftInput = {
    experiment: {
      name: "Staffing under peak demand",
      scenarioId: "scenario__peak_demand",
      scenarioParameterValues: { agents: { mode: "range", min: 2, max: 8 } },
      runCount: 20,
      seed: 7,
      dt: 1,
      maxTime: 120,
      metricIds: ["metric__average_waiting_time"],
      execution: {
        mode: "optimize",
        objectiveMetricId: "metric__average_waiting_time",
        direction: "minimize",
        steps: 3,
        runsPerStep: 5,
      },
    },
    declarations: [
      {
        subject: "maxTime",
        statement: "Minutes; the two-hour peak window is 120 minutes.",
      },
    ],
    unsupported: [],
  };
  const { server } = await startServer([
    fauxAssistantMessage(
      [fauxToolCall("getLatestNetDefinition", {}, { id: "read-call" })],
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(
      [
        fauxToolCall("draft_petrinaut_experiment", draftInput, {
          id: "draft-call",
        }),
      ],
      providerFailure,
    ),
  ]);
  let unmount = () => {};
  try {
    ({ unmount } = await openPanel());
    await send("Draft a staffing experiment.");

    const expectDraftWithoutResult = async () => {
      const draft = await findNoResultRow("draft_petrinaut_experiment");
      expect(draft?.text).toContain(noResultLabel);
      expect(draft?.busy).toBeNull();
      expect(rowContaining("Checked latest net definition")?.status).toBe("ok");
      expect(
        document.querySelector('[aria-label="Drafted experiment"]'),
      ).toBeNull();
      expect(screen.queryByText(/Preparing (draft|in another editor)/u)).toBe(
        null,
      );
      await waitFor(expectNotWaiting);
    };
    await expectDraftWithoutResult();
    unmount();
    ({ unmount } = await openPanel());
    await expectDraftWithoutResult();
    await expectFailedWithUnansweredCall("draft-call");
  } finally {
    unmount();
    fixture.fetch = null;
    fixture.client = null;
    await server.stop();
  }
}, 60_000);
