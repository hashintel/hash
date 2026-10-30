// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createContext, use, useEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { EmbedContent } from "./embed-content";

import type {
  HostNetMode,
  HostToIframeMessage,
  IframeToHostMessage,
} from "../../shared/messages";
import type { EmbedChrome } from "./embed-chrome-context";
import type { EntityId } from "@blockprotocol/type-system";
import type { useBrunchAssistant } from "@hashintel/brunch-agent/ui";
import type { ErrorTracker, PetrinautDocHandle } from "@hashintel/petrinaut";
import type * as PetrinautCore from "@hashintel/petrinaut-core";

/**
 * What each render gave the editor and Brunch's hook, so the two can be
 * compared. Hoisted with the mocks that write to it.
 */
const observed = vi.hoisted(() => ({
  petrinautHandles: [] as PetrinautDocHandle[],
  /** The chrome (Save, version picker) each editor render saw. */
  chromes: [] as unknown[],
  brunchInputs: [] as Parameters<typeof useBrunchAssistant>[0][],
  /** Failures to report from inside the editor and from Brunch's hook. */
  petrinautFailure: null as null | { error: Error; source: string },
  brunchFailure: null as null | { error: Error; source: string },
  /** The HASH host tools the page gives Brunch. */
  hashHostTools: [{ toolName: "query_hash_entities" }],
}));

vi.mock("@hashintel/petrinaut", async () => {
  const core = await vi.importActual<typeof PetrinautCore>(
    "@hashintel/petrinaut-core",
  );
  const { EmbedChromeContext } = await import("./embed-chrome-context");
  const errorTrackerContext = createContext<ErrorTracker>({
    captureException: () => {},
  });
  const Petrinaut = ({ handle }: { handle: PetrinautDocHandle }) => {
    const { captureException } = use(errorTrackerContext);
    observed.petrinautHandles.push(handle);
    observed.chromes.push(use(EmbedChromeContext));
    const failure = observed.petrinautFailure;
    useEffect(() => {
      if (failure) {
        captureException(failure.error, {
          source: failure.source,
          tags: { "petrinaut.plugin": "test" },
        });
      }
    }, [captureException, failure]);
    return null;
  };
  return {
    canonicalizePetrinautIds: core.canonicalizePetrinautIds,
    createJsonDocHandle: core.createJsonDocHandle,
    isSDCPNEqual: core.isSDCPNEqual,
    ErrorTrackerContext: errorTrackerContext,
    PetrinautOptimizationContext: createContext(null),
    Petrinaut,
  };
});

vi.mock("@hashintel/brunch-agent/ui", async () => {
  const { ErrorTrackerContext } = await import("@hashintel/petrinaut");
  return {
    BrunchAssistantContext: createContext(null),
    // Mirrors the hook's contract: its runner's `documentHandle` is the
    // open document's editor handle, and its failures go to the tracker the
    // hook reads where it is called.
    useBrunchAssistant: (input: Parameters<typeof useBrunchAssistant>[0]) => {
      observed.brunchInputs.push(input);
      const { captureException } = use(ErrorTrackerContext);
      const failure = observed.brunchFailure;
      useEffect(() => {
        if (failure) {
          captureException(failure.error, {
            source: failure.source,
            tags: { phase: "absent" },
          });
        }
      }, [captureException, failure]);
      return { assistant: null, plugins: input.plugins };
    },
  };
});

vi.mock("./brunch-hash-graph-reads", () => ({
  useBrunchHashHostTools: () => observed.hashHostTools,
}));

vi.mock("./embed-chrome-plugin", () => ({
  embedChromePlugin: { id: "embed-chrome" },
}));

vi.mock("../../../shared/auth-info-context", () => ({
  useAuthInfo: () => ({ authenticatedUser: { accountId: "alice-account" } }),
}));

const definition = {
  places: [
    {
      id: "place",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const savedEntityId = "web~net" as EntityId;

const savedMode: HostNetMode = {
  kind: "saved",
  entityId: savedEntityId,
  userEditable: true,
};

const savedSnapshot = {
  definition,
  title: "Net",
  decisionTime: "2026-10-24T00:00:00.000Z",
};

/** The editor's outgoing bridge messages, delivered to this window as the page does. */
const posted: IframeToHostMessage[] = [];

const sendToEditor = (message: HostToIframeMessage) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", { data: message, source: window }),
    );
  });

const identityRequests: {
  url: string;
  credentials: RequestInit["credentials"];
}[] = [];

beforeEach(() => {
  observed.petrinautHandles.length = 0;
  observed.chromes.length = 0;
  observed.brunchInputs.length = 0;
  observed.petrinautFailure = null;
  observed.brunchFailure = null;
  posted.length = 0;
  identityRequests.length = 0;
  vi.spyOn(window, "postMessage").mockImplementation((message: unknown) => {
    posted.push(message as IframeToHostMessage);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((url, init) => {
      identityRequests.push({
        url: url instanceof Request ? url.url : url.toString(),
        credentials: init?.credentials,
      });
      return Promise.resolve(Response.json({ ownerKey: "hash:alice-account" }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const lastBrunchInput = () => observed.brunchInputs.at(-1);
const lastEditorHandle = () => lastBrunchInput()?.openDocument?.editor?.handle;

test("Brunch's runner gets the handle the editor shows, and a new one on every load", async () => {
  render(<EmbedContent />);
  sendToEditor({
    kind: "init",
    initialDefinition: definition,
    initialTitle: "Net",
    readonly: false,
    mode: savedMode,
    savedSnapshot,
    revisions: [],
  });

  await waitFor(() => expect(lastBrunchInput()?.selected).toBe(true));
  const firstHandle = observed.petrinautHandles.at(-1);
  expect(firstHandle).toBeDefined();
  expect(lastEditorHandle()).toBe(firstHandle);
  expect(lastBrunchInput()).toMatchObject({
    ownerKey: "hash:alice-account",
    chatEndpoint: "http://localhost:5001/api/brunch/agents/hash",
    openDocument: { documentId: savedEntityId },
    voice: { enabled: false },
  });
  expect(lastBrunchInput()?.hostTools).toBe(observed.hashHostTools);
  expect(identityRequests).toEqual([
    {
      url: "http://localhost:5001/api/brunch/identity",
      credentials: "include",
    },
  ]);
  const brunchFetch = lastBrunchInput()?.fetch;

  // A revision of the same net, with identical content.
  sendToEditor({
    kind: "load",
    definition,
    title: "Net",
    mode: savedMode,
    savedSnapshot,
    revisions: [],
  });

  await waitFor(() =>
    expect(observed.petrinautHandles.at(-1)).not.toBe(firstHandle),
  );
  const secondHandle = observed.petrinautHandles.at(-1);
  expect(secondHandle).toBeDefined();
  expect(secondHandle?.doc()).toEqual(firstHandle?.doc());
  expect(secondHandle?.id).not.toBe(firstHandle?.id);
  expect(lastEditorHandle()).toBe(secondHandle);
  // The credentialed fetch keeps its identity, so the conversation's client survives.
  expect(lastBrunchInput()?.fetch).toBe(brunchFetch);
  expect(identityRequests).toHaveLength(1);
});

test("an unsaved draft gets no Brunch", async () => {
  render(<EmbedContent />);
  sendToEditor({
    kind: "init",
    initialDefinition: definition,
    initialTitle: "Draft",
    readonly: false,
    mode: { kind: "draft", seedKey: null },
    savedSnapshot: null,
    revisions: [],
  });

  await waitFor(() => expect(observed.petrinautHandles).not.toHaveLength(0));
  await waitFor(() =>
    expect(lastBrunchInput()?.ownerKey).toBe("hash:alice-account"),
  );
  expect(lastBrunchInput()).toMatchObject({
    selected: false,
    openDocument: null,
  });
});

test("Brunch's and Petrinaut's contained failures reach the host's reporter with their tags", async () => {
  observed.brunchFailure = {
    error: new Error("history failed"),
    source: "brunch.history",
  };
  observed.petrinautFailure = {
    error: new Error("plugin failed"),
    source: "plugin",
  };
  render(<EmbedContent />);
  sendToEditor({
    kind: "init",
    initialDefinition: definition,
    initialTitle: "Net",
    readonly: false,
    mode: savedMode,
    savedSnapshot,
    revisions: [],
  });

  await waitFor(() =>
    expect(posted.filter(({ kind }) => kind === "reportError")).toHaveLength(2),
  );
  expect(posted.filter(({ kind }) => kind === "reportError")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "reportError",
        source: "petrinaut",
        message: "history failed",
        mode: savedMode,
        tags: { phase: "absent", "petrinaut.origin": "brunch.history" },
      }),
      expect.objectContaining({
        kind: "reportError",
        source: "petrinaut",
        message: "plugin failed",
        mode: savedMode,
        tags: { "petrinaut.plugin": "test", "petrinaut.origin": "plugin" },
      }),
    ]),
  );
});

test("a save result leaves the revision list the host sent after the save", async () => {
  const firstRevision = {
    decisionTime: savedSnapshot.decisionTime,
    title: "Net",
  };
  const savedRevision = {
    decisionTime: "2026-10-24T01:00:00.000Z",
    title: "Net (edited)",
  };
  const lastChrome = () => observed.chromes.at(-1) as EmbedChrome | undefined;
  render(<EmbedContent />);
  sendToEditor({
    kind: "init",
    initialDefinition: definition,
    initialTitle: "Net",
    readonly: false,
    mode: savedMode,
    savedSnapshot,
    revisions: [firstRevision],
  });
  await waitFor(() => expect(lastChrome()?.revisions).toEqual([firstRevision]));

  act(() => {
    lastChrome()?.onTitleChange("Net (edited)");
  });
  act(() => {
    lastChrome()?.onSave();
  });
  const request = posted.find(
    (
      message,
    ): message is Extract<IframeToHostMessage, { kind: "requestSave" }> =>
      message.kind === "requestSave",
  );
  expect(request).toBeDefined();

  // The host's history refetch lands first, then the save's reply. A host
  // that still attaches the list from before the save must not win.
  sendToEditor({
    kind: "revisionsList",
    revisions: [savedRevision, firstRevision],
  });
  const staleList = { revisions: [firstRevision] };
  sendToEditor({
    kind: "saveResult",
    requestId: request?.requestId ?? "",
    result: {
      ok: true,
      mode: savedMode,
      savedSnapshot: {
        definition,
        title: "Net (edited)",
        decisionTime: savedRevision.decisionTime,
      },
      ...staleList,
    },
  });

  await waitFor(() =>
    expect(lastChrome()?.loadedRevisionTime).toBe(savedRevision.decisionTime),
  );
  expect(lastChrome()).toMatchObject({
    revisions: [savedRevision, firstRevision],
    isDirty: false,
    persistPending: false,
  });
});
