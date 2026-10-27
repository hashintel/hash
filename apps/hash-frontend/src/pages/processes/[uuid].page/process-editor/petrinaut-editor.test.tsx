// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createContext, use, useEffect, useLayoutEffect } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import { PetrinautEditor } from "./petrinaut-editor";

import type {
  PetrinautEditorLoad,
  PetrinautEditorSave,
  PetrinautEditorSaved,
  RevisionSummary,
} from "./petrinaut-editor";
import type { TopBarState } from "./petrinaut-editor/top-bar-context";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  BrunchAssistantHost,
  PetrinautAiAutomaticToolExecuteParams,
  useBrunchAssistant,
} from "@hashintel/brunch-agent/ui";
import type { ErrorTracker, PetrinautDocHandle } from "@hashintel/petrinaut";
import type * as PetrinautCore from "@hashintel/petrinaut-core";

/**
 * What each render gave the editor and Brunch's hook, so the two can be
 * compared. Hoisted with the mocks that write to it.
 */
const observed = vi.hoisted(() => ({
  petrinautHandles: [] as PetrinautDocHandle[],
  /** The top bar (Save, version picker) each editor render saw. */
  topBars: [] as unknown[],
  brunchInputs: [] as Parameters<typeof useBrunchAssistant>[0][],
  /** Failures to report from inside the editor and from Brunch's hook. */
  petrinautFailure: null as null | { error: Error; source: string },
  brunchFailure: null as null | { error: Error; source: string },
  /** The HASH host tools the page gives Brunch. */
  hashHostTools: [{ toolName: "query_hash_entities" }],
}));

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

const brunchPluginMarker = vi.hoisted(() => ({ id: "brunch" }));
const brunchHostContext = await vi.hoisted(async () => {
  const { createContext: createHostContext } = await import("react");
  return createHostContext<BrunchAssistantHost | null>(null);
});

vi.mock("@sentry/nextjs", () => sentry);

vi.mock("@hashintel/petrinaut", async () => {
  const core = await vi.importActual<typeof PetrinautCore>(
    "@hashintel/petrinaut-core",
  );
  const { TopBarContext } = await import("./petrinaut-editor/top-bar-context");
  const errorTrackerContext = createContext<ErrorTracker>({
    captureException: () => {},
  });
  const Petrinaut = ({
    handle,
    plugins,
  }: {
    handle: PetrinautDocHandle;
    plugins: unknown[];
  }) => {
    const { captureException } = use(errorTrackerContext);
    observed.petrinautHandles.push(handle);
    observed.topBars.push(use(TopBarContext));
    // Brunch is the only assistant, so the editor shows it, mounting its
    // content, which marks it as shown, while its plugin is listed.
    const show = use(brunchHostContext)?.show;
    const brunchListed = plugins.includes(brunchPluginMarker);
    useLayoutEffect(
      () => (brunchListed ? show?.(handle.id) : undefined),
      [brunchListed, show, handle.id],
    );
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
    BrunchAssistantContext: brunchHostContext,
    brunchPlugin: brunchPluginMarker,
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
      return { assistant: null, openAIVoiceConfig: null };
    },
  };
});

vi.mock("./petrinaut-editor/process-petrinaut/brunch-hash-graph-reads", () => ({
  useBrunchHashHostTools: () => observed.hashHostTools,
}));

vi.mock("./petrinaut-editor/process-petrinaut/top-bar-plugin", () => ({
  topBarPlugin: { id: "top-bar" },
}));

vi.mock("../../../shared/auth-info-context", () => ({
  useAuthInfo: () => ({ authenticatedUser: { accountId: "alice-account" } }),
}));

/** A net with a legacy (non-UUID) id, which the handle converts. */
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

const savedLoad = (
  decisionTime = "2026-10-24T00:00:00.000Z",
  reason: PetrinautEditorLoad["reason"] = "open",
) =>
  ({
    definition,
    title: "Net",
    mode: { kind: "saved", entityId: savedEntityId },
    savedSnapshot: { definition, title: "Net", decisionTime },
    reason,
  }) satisfies PetrinautEditorLoad;

const draftLoad = (): PetrinautEditorLoad => ({
  definition,
  title: "Draft",
  mode: { kind: "draft", seedKey: null },
  savedSnapshot: null,
  reason: "open",
});

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const identityRequests: {
  url: string;
  credentials: RequestInit["credentials"];
}[] = [];

const onDirtyChange = vi.fn<(isDirty: boolean) => void>();
const onSave =
  vi.fn<(save: PetrinautEditorSave) => Promise<PetrinautEditorSaved>>();

beforeEach(() => {
  observed.petrinautHandles.length = 0;
  observed.topBars.length = 0;
  observed.brunchInputs.length = 0;
  observed.petrinautFailure = null;
  observed.brunchFailure = null;
  identityRequests.length = 0;
  sentry.captureException.mockClear();
  onDirtyChange.mockClear();
  onSave.mockReset();
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
  vi.unstubAllGlobals();
});

type EditorProps = {
  load: PetrinautEditorLoad | null;
  readonly?: boolean;
  revisions?: RevisionSummary[];
};

const renderEditor = (initial: EditorProps) => {
  const element = ({ load, readonly = false, revisions = [] }: EditorProps) => (
    <PetrinautEditor
      load={load}
      readonly={readonly}
      revisions={revisions}
      onDirtyChange={onDirtyChange}
      onNavigateBack={() => {}}
      onSelectRevision={() => {}}
      onSave={onSave}
    />
  );
  const view = render(element(initial));
  return { rerender: (next: EditorProps) => view.rerender(element(next)) };
};

const lastBrunchInput = () => observed.brunchInputs.at(-1);
const lastEditorHandle = () => lastBrunchInput()?.openDocument?.editor?.handle;
const lastHandle = () => observed.petrinautHandles.at(-1);
const lastTopBar = () => observed.topBars.at(-1) as TopBarState | undefined;

test("Brunch's runner gets the handle the editor shows, a new one on every load, and the same one across other updates", async () => {
  const firstLoad = savedLoad();
  const { rerender } = renderEditor({ load: firstLoad });

  await waitFor(() => expect(lastBrunchInput()?.selected).toBe(true));
  const shownFrom = observed.brunchInputs.length - 1;
  const firstHandle = lastHandle();
  expect(firstHandle).toBeDefined();
  expect(lastEditorHandle()).toBe(firstHandle);
  expect(lastBrunchInput()).toMatchObject({
    ownerKey: "hash:alice-account",
    chatEndpoint: "http://localhost:5001/api/brunch/agents/hash",
    openDocument: { documentId: savedEntityId },
    voice: { enabled: false },
  });
  // The page's graph reads, then the agent's save through the editor's Save.
  expect(lastBrunchInput()?.hostTools).toEqual([
    ...observed.hashHostTools,
    expect.objectContaining({ toolName: brunchTools.saveHashNet }),
  ]);
  expect(identityRequests).toEqual([
    {
      url: "http://localhost:5001/api/brunch/identity",
      credentials: "include",
    },
  ]);
  const brunchFetch = lastBrunchInput()?.fetch;

  // A refreshed revision list is not a load.
  const revisions = [
    { decisionTime: "2026-10-24T00:00:00.000Z", title: "Net" },
  ];
  rerender({ load: firstLoad, revisions });
  await waitFor(() => expect(lastTopBar()?.revisions).toEqual(revisions));
  expect(lastHandle()).toBe(firstHandle);

  // A revision of the same net, with identical content, is.
  rerender({ load: savedLoad(), revisions });

  await waitFor(() => expect(lastHandle()).not.toBe(firstHandle));
  const secondHandle = lastHandle();
  expect(secondHandle?.doc()).toEqual(firstHandle?.doc());
  expect(secondHandle?.id).not.toBe(firstHandle?.id);
  expect(lastEditorHandle()).toBe(secondHandle);
  // The credentialed fetch keeps its identity, so the conversation's client survives.
  expect(lastBrunchInput()?.fetch).toBe(brunchFetch);
  // The new handle's Brunch content marks Brunch as the old one unmarks it,
  // so Brunch stays shown, and connected, across the load.
  expect(
    observed.brunchInputs.slice(shownFrom).map(({ selected }) => selected),
  ).not.toContain(false);
  expect(identityRequests).toHaveLength(1);
});

test("losing edit permission makes the open net readonly without reloading it", async () => {
  const load = savedLoad();
  const { rerender } = renderEditor({ load });
  await waitFor(() => expect(lastTopBar()?.readonly).toBe(false));
  const handle = lastHandle();

  rerender({ load, readonly: true });

  await waitFor(() => expect(lastTopBar()?.readonly).toBe(true));
  expect(lastHandle()).toBe(handle);
});

test("a saved net with legacy ids loads clean, and its edits are reported dirty", async () => {
  renderEditor({ load: savedLoad() });

  await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
  expect(lastTopBar()).toMatchObject({ isDirty: false, saveLabel: "Saved" });

  act(() => lastTopBar()?.onTitleChange("Net (edited)"));

  await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
  expect(lastTopBar()).toMatchObject({ isDirty: true, saveLabel: "Save" });
});

test("Brunch's and Petrinaut's contained failures reach Sentry as thrown, tagged with the open net", async () => {
  const brunchError = new Error("history failed");
  const pluginError = new Error("plugin failed");
  observed.brunchFailure = { error: brunchError, source: "brunch.history" };
  observed.petrinautFailure = { error: pluginError, source: "plugin" };
  renderEditor({ load: savedLoad() });

  await waitFor(() => expect(sentry.captureException).toHaveBeenCalledTimes(2));
  const mode = { kind: "saved", entityId: savedEntityId };
  expect(sentry.captureException).toHaveBeenCalledWith(brunchError, {
    tags: {
      phase: "absent",
      "petrinaut.origin": "brunch.history",
      "petrinaut.source": "petrinaut",
      "petrinaut.mode": "saved",
    },
    contexts: { petrinaut: { mode, readonly: false } },
  });
  expect(sentry.captureException).toHaveBeenCalledWith(pluginError, {
    tags: {
      "petrinaut.plugin": "test",
      "petrinaut.origin": "plugin",
      "petrinaut.source": "petrinaut",
      "petrinaut.mode": "saved",
    },
    contexts: { petrinaut: { mode, readonly: false } },
  });
});

test("Save submits the net as it was pressed once, and marks only that as saved", async () => {
  const pending = deferred<PetrinautEditorSaved>();
  onSave.mockReturnValue(pending.promise);
  renderEditor({ load: savedLoad() });
  await waitFor(() => expect(lastTopBar()).toBeDefined());
  const handle = lastHandle();

  act(() => lastTopBar()?.onTitleChange("Net (edited)"));
  act(() => lastTopBar()?.onSave());
  act(() => lastTopBar()?.onSave());

  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledWith({
    definition: handle?.doc(),
    title: "Net (edited)",
    entityId: savedEntityId,
  });
  expect(lastTopBar()?.persistPending).toBe(true);

  // An edit made while the save is in flight.
  act(() => lastTopBar()?.onTitleChange("Net (later)"));
  await act(async () => {
    pending.resolve({
      entityId: savedEntityId,
      decisionTime: "2026-10-24T01:00:00.000Z",
    });
    await pending.promise;
  });

  expect(lastTopBar()).toMatchObject({
    persistPending: false,
    loadedRevisionTime: "2026-10-24T01:00:00.000Z",
    isDirty: true,
  });
  expect(lastHandle()).toBe(handle);

  act(() => lastTopBar()?.onTitleChange("Net (edited)"));
  expect(lastTopBar()?.isDirty).toBe(false);
});

test("a failed save settles, leaves the net dirty, and can be retried", async () => {
  onSave.mockRejectedValueOnce(new Error("graph unavailable"));
  renderEditor({ load: savedLoad() });
  await waitFor(() => expect(lastTopBar()).toBeDefined());

  act(() => lastTopBar()?.onTitleChange("Net (edited)"));
  await act(async () => {
    lastTopBar()?.onSave();
    await Promise.resolve();
  });

  expect(lastTopBar()).toMatchObject({
    persistPending: false,
    isDirty: true,
    loadedRevisionTime: "2026-10-24T00:00:00.000Z",
  });

  onSave.mockResolvedValueOnce({
    entityId: savedEntityId,
    decisionTime: "2026-10-24T01:00:00.000Z",
  });
  await act(async () => {
    lastTopBar()?.onSave();
    await Promise.resolve();
  });

  expect(onSave).toHaveBeenCalledTimes(2);
  expect(lastTopBar()).toMatchObject({
    isDirty: false,
    loadedRevisionTime: "2026-10-24T01:00:00.000Z",
  });
});

test("a save finishing after another load leaves that load as it was", async () => {
  const pending = deferred<PetrinautEditorSaved>();
  onSave.mockReturnValue(pending.promise);
  const { rerender } = renderEditor({ load: savedLoad() });
  await waitFor(() => expect(lastTopBar()).toBeDefined());

  act(() => lastTopBar()?.onTitleChange("Net (edited)"));
  act(() => lastTopBar()?.onSave());

  const otherVersion = "2026-10-23T00:00:00.000Z";
  rerender({ load: savedLoad(otherVersion) });
  await waitFor(() =>
    expect(lastTopBar()?.loadedRevisionTime).toBe(otherVersion),
  );
  const reloadedHandle = lastHandle();
  expect(lastTopBar()).toMatchObject({ persistPending: false, title: "Net" });

  await act(async () => {
    pending.resolve({
      entityId: savedEntityId,
      decisionTime: "2026-10-24T01:00:00.000Z",
    });
    await pending.promise;
  });

  expect(lastTopBar()).toMatchObject({
    loadedRevisionTime: otherVersion,
    title: "Net",
    isDirty: false,
    persistPending: false,
  });
  expect(lastHandle()).toBe(reloadedHandle);
});

test("a Save kept from before Create, called once Create resolves but before the editor rerenders, saves the current title to the created net", async () => {
  const createdEntityId = "web~created" as EntityId;
  const create = deferred<PetrinautEditorSaved>();
  onSave.mockReturnValueOnce(create.promise).mockResolvedValueOnce({
    entityId: createdEntityId,
    decisionTime: "2026-10-24T02:00:00.000Z",
  });
  renderEditor({ load: draftLoad() });
  await waitFor(() => expect(lastTopBar()?.saveLabel).toBe("Create"));
  const draftBar = lastTopBar();
  act(() => draftBar?.onSave());

  await act(async () => {
    create.resolve({
      entityId: createdEntityId,
      decisionTime: "2026-10-24T01:00:00.000Z",
    });
    await create.promise;
    // The editor's save continues a few microtasks later; a task would
    // let React render.
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
    // Create has resolved, and the editor has not rendered since.
    expect(lastTopBar()).toMatchObject({
      saveLabel: "Create",
      persistPending: true,
    });
    draftBar?.onTitleChange("Renamed");
    draftBar?.onSave();
  });

  expect(onSave.mock.calls.map(([save]) => save)).toMatchObject([
    { title: "Draft", entityId: null },
    { title: "Renamed", entityId: createdEntityId },
  ]);
  await waitFor(() =>
    expect(lastTopBar()).toMatchObject({
      title: "Renamed",
      saveLabel: "Saved",
      persistPending: false,
      isDirty: false,
    }),
  );
});

test("Create turns the draft into the saved net in the same editor, which then offers Brunch", async () => {
  const createdEntityId = "web~created" as EntityId;
  onSave.mockResolvedValue({
    entityId: createdEntityId,
    decisionTime: "2026-10-24T01:00:00.000Z",
  });
  renderEditor({ load: draftLoad() });
  await waitFor(() => expect(lastTopBar()?.saveLabel).toBe("Create"));
  const handle = lastHandle();

  await act(async () => {
    lastTopBar()?.onSave();
    await Promise.resolve();
  });

  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Draft", entityId: null }),
  );
  await waitFor(() =>
    expect(lastBrunchInput()?.openDocument?.documentId).toBe(createdEntityId),
  );
  expect(lastTopBar()).toMatchObject({ saveLabel: "Saved", isDirty: false });
  expect(lastHandle()).toBe(handle);
  expect(lastEditorHandle()).toBe(handle);
});

/** Brunch's save tool as the page gave it, for the load shown then. */
const agentSaveTool = () => {
  const tool = lastBrunchInput()?.hostTools?.find(
    ({ toolName }) => toolName === brunchTools.saveHashNet,
  );
  if (!tool) {
    throw new Error("The page gave Brunch no save");
  }
  return tool;
};

/** Runs the agent's save as Brunch's panel does, once the user has approved it. */
const agentSave = (
  documentId: string,
  signal = new AbortController().signal,
  tool = agentSaveTool(),
) => {
  const settled = Promise.resolve(
    tool.execute({
      input: { documentId },
      toolCallId: "save-1",
      signal,
    } as PetrinautAiAutomaticToolExecuteParams),
  );
  const state = { settled: false };
  void settled.then(
    () => {
      state.settled = true;
    },
    () => {
      state.settled = true;
    },
  );
  return { settled, state };
};

const editNet = (name: string) =>
  act(() =>
    lastEditorHandle()?.change((draft) => {
      draft.places.push({
        // Already a Petrinaut id, so the saved snapshot keeps it as it is.
        id: crypto.randomUUID(),
        name,
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      });
    }),
  );

const renderBrunchEditor = async (
  initial: EditorProps = { load: savedLoad() },
) => {
  const rendered = renderEditor(initial);
  await waitFor(() => expect(lastBrunchInput()?.selected).toBe(true));
  return rendered;
};

test("the agent's save runs the Save button's one save and settles once saved, still dirty for an edit made after it", async () => {
  const pending = deferred<PetrinautEditorSaved>();
  onSave.mockReturnValue(pending.promise);
  await renderBrunchEditor();
  editNet("before-save");
  const captured = lastEditorHandle()?.doc();

  const save = agentSave(savedEntityId);
  expect(onSave).toHaveBeenCalledExactlyOnceWith({
    definition: captured,
    title: "Net",
    entityId: savedEntityId,
  });
  await waitFor(() => expect(lastTopBar()?.persistPending).toBe(true));
  editNet("after-save");
  await act(async () => {});
  expect(save.state.settled).toBe(false);

  const decisionTime = "2026-10-24T01:00:00.000Z";
  await act(async () => {
    pending.resolve({ entityId: savedEntityId, decisionTime });
    await pending.promise;
  });

  await expect(save.settled).resolves.toEqual({
    saved: true,
    decisionTime,
    title: "Net",
    stillDirty: true,
  });
  expect(onSave).toHaveBeenCalledOnce();
  expect(lastTopBar()).toMatchObject({
    isDirty: true,
    persistPending: false,
    loadedRevisionTime: decisionTime,
  });
});

/** Runs pending promise callbacks without giving React a task to render in. */
const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

test("the agent's save stays unsettled after the host's save resolves until the editor commits the saved snapshot, and reports the dirty state committed then", async () => {
  const pending = deferred<PetrinautEditorSaved>();
  onSave.mockReturnValue(pending.promise);
  await renderBrunchEditor();
  editNet("before-save");
  const save = agentSave(savedEntityId);
  await waitFor(() => expect(lastTopBar()?.persistPending).toBe(true));
  const rendersBefore = observed.topBars.length;

  // The host's save resolves, outside any act, so React has not rendered.
  const decisionTime = "2026-10-24T01:00:00.000Z";
  pending.resolve({ entityId: savedEntityId, decisionTime });
  await flushMicrotasks();
  expect(observed.topBars).toHaveLength(rendersBefore);
  expect(save.state.settled).toBe(false);

  // An edit in the same window, before the saved snapshot commits.
  lastEditorHandle()?.change((draft) => {
    draft.places[0]!.name = "after-completion";
  });
  await flushMicrotasks();
  expect(save.state.settled).toBe(false);

  // React commits the saved snapshot with the edit.
  await act(async () => {});
  expect(lastTopBar()).toMatchObject({
    persistPending: false,
    loadedRevisionTime: decisionTime,
    isDirty: true,
  });
  await expect(save.settled).resolves.toEqual({
    saved: true,
    decisionTime,
    title: "Net",
    stillDirty: true,
  });
});

test("a load after the host's save resolves but before its snapshot commits leaves the agent's save to Brunch's abort", async () => {
  const pending = deferred<PetrinautEditorSaved>();
  onSave.mockReturnValue(pending.promise);
  const { rerender } = await renderBrunchEditor();
  editNet("before-save");
  const controller = new AbortController();
  const save = agentSave(savedEntityId, controller.signal);
  await waitFor(() => expect(lastTopBar()?.persistPending).toBe(true));
  const savingHandle = lastHandle();

  pending.resolve({
    entityId: savedEntityId,
    decisionTime: "2026-10-24T01:00:00.000Z",
  });
  await flushMicrotasks();
  expect(save.state.settled).toBe(false);

  // The next commit is of another load, not of the saved snapshot.
  const otherVersion = "2026-10-23T00:00:00.000Z";
  rerender({ load: savedLoad(otherVersion) });
  await act(async () => {});
  expect(lastHandle()).not.toBe(savingHandle);
  expect(lastTopBar()?.loadedRevisionTime).toBe(otherVersion);
  expect(save.state.settled).toBe(false);

  controller.abort(new Error("Brunch stopped the turn"));
  await expect(save.settled).rejects.toThrow("Brunch stopped the turn");
});

test("the agent's save of a net with nothing edited since reports it clean", async () => {
  onSave.mockResolvedValue({
    entityId: savedEntityId,
    decisionTime: "2026-10-24T01:00:00.000Z",
  });
  await renderBrunchEditor();
  editNet("edited");

  await expect(agentSave(savedEntityId).settled).resolves.toMatchObject({
    saved: true,
    stillDirty: false,
  });
  await waitFor(() => expect(lastTopBar()?.isDirty).toBe(false));
});

test("a failed save settles with its error after its one attempt, and nothing retries it", async () => {
  onSave.mockRejectedValue(
    new Error(
      "Persist appeared to succeed but the entity wasn't visible on refetch",
    ),
  );
  await renderBrunchEditor();
  editNet("edited");

  await expect(agentSave(savedEntityId).settled).resolves.toEqual({
    saved: false,
    error:
      "Persist appeared to succeed but the entity wasn't visible on refetch",
  });
  await act(async () => {});
  expect(onSave).toHaveBeenCalledOnce();
  // The editor stays as the button leaves it: dirty against the old snapshot.
  expect(lastTopBar()).toMatchObject({
    isDirty: true,
    persistPending: false,
    loadedRevisionTime: "2026-10-24T00:00:00.000Z",
  });
});

// Brunch is offered only on an editable saved net, so a read-only net or a
// draft can only reach the agent's save when the net changes under a session.
test.each([
  {
    refused: "another net",
    change: null as EditorProps | null,
    documentId: "web~other" as EntityId,
    reason: "That isn't the net open in the editor.",
  },
  {
    refused: "a read-only net",
    change: { readonly: true },
    documentId: savedEntityId,
    reason: "The user can't edit this net, so they can't save it.",
  },
  {
    refused: "a draft",
    change: { load: draftLoad() },
    documentId: savedEntityId,
    reason:
      "The net is an unsaved draft, which the user creates with the editor's Create.",
  },
])(
  "the agent's save of $refused is refused as not started and saves nothing",
  async ({ change, documentId, reason }) => {
    const load = savedLoad();
    const { rerender } = await renderBrunchEditor({ load });
    const tool = agentSaveTool();
    const { readSaveState } = lastBrunchInput() ?? {};
    if (change) {
      rerender({ load, ...change });
      await act(async () => {});
    }

    expect(readSaveState?.(documentId).refusal).toBe(reason);
    await expect(
      agentSave(documentId, undefined, tool).settled,
    ).resolves.toEqual({ applied: false, reason });
    expect(onSave).not.toHaveBeenCalled();
  },
);

test("the agent's save while a save is pending is refused as not started, and the card shows the net's title and last save", async () => {
  onSave.mockReturnValue(deferred<PetrinautEditorSaved>().promise);
  await renderBrunchEditor();
  expect(lastBrunchInput()?.readSaveState?.(savedEntityId)).toEqual({
    title: "Net",
    lastSavedTime: "2026-10-24T00:00:00.000Z",
    refusal: null,
  });
  act(() => lastTopBar()?.onSave());

  await expect(agentSave(savedEntityId).settled).resolves.toEqual({
    applied: false,
    reason: "A save of this net is already in progress.",
  });
  expect(onSave).toHaveBeenCalledOnce();
});

test("aborting the agent's save rejects it without cancelling the save it started", async () => {
  const pending = deferred<PetrinautEditorSaved>();
  onSave.mockReturnValue(pending.promise);
  await renderBrunchEditor();
  editNet("edited");
  const controller = new AbortController();
  const save = agentSave(savedEntityId, controller.signal);

  controller.abort(new Error("Brunch stopped the turn"));
  await expect(save.settled).rejects.toThrow("Brunch stopped the turn");

  await act(async () => {
    pending.resolve({
      entityId: savedEntityId,
      decisionTime: "2026-10-24T01:00:00.000Z",
    });
    await pending.promise;
  });
  expect(lastTopBar()).toMatchObject({
    isDirty: false,
    persistPending: false,
    loadedRevisionTime: "2026-10-24T01:00:00.000Z",
  });
});

test("a load before the save completes leaves the agent's save unsettled until Brunch aborts it, and the earlier load's tool can't save the new one", async () => {
  const pending = deferred<PetrinautEditorSaved>();
  onSave.mockReturnValue(pending.promise);
  const { rerender } = await renderBrunchEditor();
  const earlierTool = agentSaveTool();
  const controller = new AbortController();
  const save = agentSave(savedEntityId, controller.signal);

  rerender({ load: savedLoad() });
  await waitFor(() => expect(lastTopBar()?.persistPending).toBe(false));
  // The late completion is ignored, as it is for the button.
  await act(async () => {
    pending.resolve({ entityId: savedEntityId, decisionTime: "late" });
    await pending.promise;
  });
  expect(save.state.settled).toBe(false);
  expect(lastTopBar()?.loadedRevisionTime).toBe("2026-10-24T00:00:00.000Z");

  await expect(
    agentSave(savedEntityId, undefined, earlierTool).settled,
  ).resolves.toEqual({
    applied: false,
    reason: "That isn't the net open in the editor.",
  });
  expect(onSave).toHaveBeenCalledOnce();

  controller.abort(new Error("Brunch stopped the turn"));
  await expect(save.settled).rejects.toThrow("Brunch stopped the turn");
});

test("a pick of another saved revision reaches Brunch as a version load that Saves leave unchanged", async () => {
  const latest = "2026-10-24T00:00:00.000Z";
  const earlier = "2026-10-23T00:00:00.000Z";
  const lastVersionLoad = () => lastBrunchInput()?.versionLoad;
  const { rerender } = await renderBrunchEditor({ load: savedLoad(latest) });

  // Opening the net is no version load, and nor is picking the version open.
  expect(lastVersionLoad()).toBeUndefined();
  rerender({ load: savedLoad(latest, "revision") });
  await act(async () => {});
  expect(lastVersionLoad()).toBeUndefined();

  rerender({ load: savedLoad(earlier, "revision") });
  await waitFor(() =>
    expect(lastVersionLoad()).toEqual({
      id: expect.any(String),
      decisionTime: earlier,
    }),
  );
  const firstLoad = lastVersionLoad();

  // The button's Save and the agent's leave it: they build on the loaded version.
  onSave
    .mockResolvedValueOnce({
      entityId: savedEntityId,
      decisionTime: "2026-10-24T02:00:00.000Z",
    })
    .mockResolvedValueOnce({
      entityId: savedEntityId,
      decisionTime: "2026-10-24T03:00:00.000Z",
    });
  editNet("after-load");
  await act(async () => {
    lastTopBar()?.onSave();
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(lastTopBar()?.loadedRevisionTime).toBe("2026-10-24T02:00:00.000Z"),
  );
  editNet("before-agent-save");
  await expect(agentSave(savedEntityId).settled).resolves.toMatchObject({
    saved: true,
  });
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(lastVersionLoad()).toBe(firstLoad);

  // Picking the same earlier revision again is a new version load.
  rerender({ load: savedLoad(earlier, "revision") });
  await waitFor(() => expect(lastVersionLoad()).not.toBe(firstLoad));
  expect(lastVersionLoad()).toEqual({
    id: expect.any(String),
    decisionTime: earlier,
  });
  expect(lastVersionLoad()?.id).not.toBe(firstLoad?.id);

  // Opening a net, even this one at that version, carries none.
  rerender({ load: savedLoad(earlier) });
  await waitFor(() => expect(lastVersionLoad()).toBeUndefined());
});
