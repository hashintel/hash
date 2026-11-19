// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useEffect, useReducer } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  createEntityMutation,
  updateEntityMutation,
} from "../../../graphql/queries/knowledge/entity.queries";
import { ProcessEditor, type ProcessEditorView } from "./process-editor";

import type { PersistedNet } from "../../processes.page/use-persisted-nets";
import type { PetrinautEditor } from "./process-editor/petrinaut-editor";
import type { PetriNetRevision } from "./process-editor/use-process-save-and-load/use-petri-net-revisions";
import type * as ApolloClient from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";
import type { AlertModal } from "@hashintel/design-system";
import type { SDCPN } from "@hashintel/petrinaut";
import type { ComponentProps } from "react";

type EditorProps = ComponentProps<typeof PetrinautEditor>;
type AlertProps = ComponentProps<typeof AlertModal>;
type RefetchResult = { data: { nets: PersistedNet[] } };
type UpdateEntityOptions = {
  variables: { entityUpdate: { entityId: EntityId } };
};

/**
 * The graph the host reads and writes, and what the host rendered. Hoisted
 * with the mocks that use it.
 */
const graph = vi.hoisted(() => ({
  nets: [] as PersistedNet[],
  /** Each net's revision history, newest first. */
  history: new Map<string, PetriNetRevision[]>(),
  createEntity: vi.fn(),
  updateEntity:
    vi.fn<(options: UpdateEntityOptions) => Promise<{ data: object }>>(),
  refetchNets: vi.fn(),
}));

const observed = vi.hoisted(() => ({
  editorProps: [] as EditorProps[],
  /** The net each render asked the revision history for. */
  historyQueries: [] as (EntityId | null)[],
  alert: null as AlertProps | null,
}));

const router = vi.hoisted(() => ({
  push: vi.fn(() => Promise.resolve(true)),
  replace: vi.fn(() => Promise.resolve(true)),
  events: { on: vi.fn(), off: vi.fn() },
}));

vi.mock("next/router", () => ({ useRouter: () => router }));

/** Whether the CSP gate lets Petrinaut render; `false` while it reloads. */
const gate = vi.hoisted(() => ({ canRenderPetrinaut: true }));

vi.mock("./process-editor/use-string-evaluation-gate", () => ({
  useStringEvaluationGate: () => gate.canRenderPetrinaut,
}));

/** Stands in for the editor's module, recording what the host gives it. */
vi.mock("next/dynamic", () => ({
  default: () => (props: EditorProps) => {
    observed.editorProps.push(props);
    return null;
  },
}));

vi.mock("@hashintel/design-system", () => ({
  AlertModal: (props: AlertProps) => {
    observed.alert = props;
    useEffect(
      () => () => {
        observed.alert = null;
      },
      [],
    );
    return null;
  },
}));

vi.mock("@hashintel/petrinaut", () => ({}));

vi.mock("@apollo/client", async (importOriginal) => {
  const original = await importOriginal<typeof ApolloClient>();
  return {
    ...original,
    useMutation: (mutation: unknown) => [
      mutation === createEntityMutation
        ? graph.createEntity
        : mutation === updateEntityMutation
          ? graph.updateEntity
          : vi.fn(),
    ],
  };
});

vi.mock("../../processes.page/use-persisted-nets", () => ({
  usePersistedNets: () => ({
    persistedNets: graph.nets,
    loading: false,
    refetch: graph.refetchNets,
  }),
  getPersistedNetsFromSubgraph: (data: RefetchResult["data"]) => data.nets,
}));

vi.mock("../../shared/workspace-context", () => ({
  useActiveWorkspace: () => ({ activeWorkspaceWebId: "web" }),
}));

vi.mock("@local/hash-graph-sdk/entity", () => ({
  HashEntity: class {
    entityId: EntityId;
    constructor(entity: { entityId: EntityId }) {
      this.entityId = entity.entityId;
    }
  },
}));

/** Answers from the graph's history, as it stands when last (re)fetched. */
vi.mock(
  "./process-editor/use-process-save-and-load/use-petri-net-revisions",
  () => ({
    usePetriNetRevisions: (entityId: EntityId | null) => {
      const [, refresh] = useReducer((count: number) => count + 1, 0);
      observed.historyQueries.push(entityId);
      return {
        revisions: (entityId && graph.history.get(entityId)) ?? [],
        refetch: () => {
          refresh();
          return Promise.resolve();
        },
      };
    },
  }),
);

const webId = "00000000-0000-4000-8000-000000000001";
const uuidA = "00000000-0000-4000-8000-00000000000a";
const uuidB = "00000000-0000-4000-8000-00000000000b";
const uuidCreated = "00000000-0000-4000-8000-00000000000c";
const netAId = `${webId}~${uuidA}` as EntityId;
const netBId = `${webId}~${uuidB}` as EntityId;
const createdId = `${webId}~${uuidCreated}` as EntityId;

const definition = (label: string): SDCPN => ({
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [{ id: label } as SDCPN["parameters"][number]],
});

const makeNet = (
  entityId: EntityId,
  lastUpdated = "2026-10-24T00:00:00.000Z",
): PersistedNet => ({
  entityId,
  title: entityId,
  definition: definition(entityId),
  userEditable: true,
  lastUpdated,
});

const revisionOf = (net: PersistedNet): PetriNetRevision => ({
  decisionTime: net.lastUpdated,
  title: net.title,
  definition: net.definition,
});

const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const netA = makeNet(netAId);
const netB = makeNet(netBId);

beforeEach(() => {
  graph.nets = [netA, netB];
  graph.history = new Map([
    [netAId, [revisionOf(netA)]],
    [netBId, [revisionOf(netB)]],
  ]);
  graph.createEntity.mockReset();
  graph.updateEntity.mockReset().mockResolvedValue({ data: {} });
  graph.refetchNets
    .mockReset()
    .mockImplementation(() => Promise.resolve({ data: { nets: graph.nets } }));
  observed.editorProps.length = 0;
  observed.historyQueries.length = 0;
  observed.alert = null;
  router.push.mockClear();
  router.replace.mockClear();
  gate.canRenderPetrinaut = true;
});

afterEach(() => {
  cleanup();
});

const editor = (): EditorProps => {
  const props = observed.editorProps.at(-1);
  if (!props) {
    throw new Error("The editor has not rendered");
  }
  return props;
};

const savedView = (entityUuid: string): ProcessEditorView => ({
  kind: "saved",
  entityUuid,
});
/** A draft is named before it exists: its first save creates `createdId`. */
const draftView: ProcessEditorView = {
  kind: "draft",
  seedKey: null,
  entityId: createdId,
};

const renderHost = async (view: ProcessEditorView) => {
  const rendered = render(<ProcessEditor view={view} />);
  await waitFor(() => expect(editor().load).not.toBeNull());
  return {
    navigate: (next: ProcessEditorView) =>
      rendered.rerender(<ProcessEditor view={next} />),
  };
};

/** Moves to another net with unsaved changes, confirming the discard. */
const discardAndNavigate = async (
  navigate: (next: ProcessEditorView) => void,
  next: ProcessEditorView,
) => {
  act(() => editor().onDirtyChange(true));
  navigate(next);
  await waitFor(() => expect(observed.alert).not.toBeNull());
  act(() => observed.alert?.callback?.());
};

const updatedEntityIds = () =>
  graph.updateEntity.mock.calls.map(
    ([options]) => options.variables.entityUpdate.entityId,
  );

test("while the CSP gate holds Petrinaut back, the loading skeleton shows even once a view has loaded", () => {
  gate.canRenderPetrinaut = false;

  const { container } = render(<ProcessEditor view={draftView} />);

  expect(observed.editorProps).toEqual([]);
  expect(container.querySelector(".MuiSkeleton-root")).not.toBeNull();
});

test("a revision pick is a new load even with identical content, and says it is one; rerenders are not loads", async () => {
  const { navigate } = await renderHost(savedView(uuidA));
  const firstLoad = editor().load;
  expect(firstLoad).toMatchObject({
    title: netA.title,
    mode: { kind: "saved", entityId: netAId },
    savedSnapshot: { decisionTime: netA.lastUpdated },
    reason: "open",
  });
  expect(editor().readonly).toBe(false);

  navigate(savedView(uuidA));
  expect(editor().load).toBe(firstLoad);

  act(() => editor().onSelectRevision(netA.lastUpdated));

  expect(editor().load).not.toBe(firstLoad);
  expect(editor().load).toEqual({ ...firstLoad, reason: "revision" });
});

test("a save writes to the net the editor names, and resolves once its revision list includes the save", async () => {
  const saved = makeNet(netAId, "2026-10-24T01:00:00.000Z");
  graph.updateEntity.mockImplementation(() => {
    graph.nets = [saved, netB];
    graph.history.set(netAId, [revisionOf(saved), revisionOf(netA)]);
    return Promise.resolve({ data: {} });
  });
  await renderHost(savedView(uuidA));
  const load = editor().load;

  const result = await act(() =>
    editor().onSave({
      definition: saved.definition,
      title: saved.title,
      entityId: netAId,
    }),
  );

  expect(result).toMatchObject({
    entityId: netAId,
    decisionTime: saved.lastUpdated,
  });
  expect(updatedEntityIds()).toEqual([netAId]);
  expect(editor().revisions).toEqual([
    { decisionTime: saved.lastUpdated, title: saved.title },
    { decisionTime: netA.lastUpdated, title: netA.title },
  ]);
  expect(editor().load).toBe(load);
});

test("Create moves the URL to the new net without reloading the editor, and reads its history", async () => {
  const created = makeNet(createdId);
  graph.createEntity.mockImplementation(() => {
    graph.nets = [netA, netB, created];
    return Promise.resolve({ data: { createEntity: { entityId: createdId } } });
  });
  const { navigate } = await renderHost(draftView);
  const draftLoad = editor().load;
  expect(draftLoad?.mode).toEqual({
    kind: "draft",
    seedKey: null,
    entityId: createdId,
  });

  const result = await act(() =>
    editor().onSave({
      definition: definition("new"),
      title: "New",
      entityId: null,
    }),
  );

  expect(result.entityId).toBe(createdId);
  // The net is created under the draft's own id, in the draft's web.
  expect(graph.createEntity).toHaveBeenCalledWith(
    expect.objectContaining({
      variables: expect.objectContaining({
        webId,
        entityUuid: uuidCreated,
      }) as unknown,
    }),
  );
  expect(router.replace).toHaveBeenCalledWith(`/processes/${uuidCreated}`);
  navigate(savedView(uuidCreated));

  expect(editor().load).toBe(draftLoad);
  expect(observed.historyQueries.at(-1)).toBe(createdId);
});

test("a Create finishing after another net loads leaves that net, its URL and its history", async () => {
  const lateCreate = deferred<{
    data: { createEntity: { entityId: EntityId } };
  }>();
  graph.createEntity.mockReturnValue(lateCreate.promise);
  const { navigate } = await renderHost(draftView);

  let create: Promise<unknown> = Promise.resolve();
  act(() => {
    create = editor().onSave({
      definition: definition("new"),
      title: "New",
      entityId: null,
    });
  });
  await discardAndNavigate(navigate, savedView(uuidB));
  await waitFor(() =>
    expect(editor().load?.mode).toEqual({ kind: "saved", entityId: netBId }),
  );
  const loadB = editor().load;

  graph.nets = [netA, netB, makeNet(createdId)];
  await act(async () => {
    lateCreate.resolve({ data: { createEntity: { entityId: createdId } } });
    await create;
  });

  expect(router.replace).not.toHaveBeenCalled();
  expect(editor().load).toBe(loadB);
  expect(observed.historyQueries.at(-1)).toBe(netBId);
});

test("a Create finishing after leaving the editor does not navigate back to it", async () => {
  const lateCreate = deferred<{
    data: { createEntity: { entityId: EntityId } };
  }>();
  graph.createEntity.mockReturnValue(lateCreate.promise);
  await renderHost(draftView);

  let create: Promise<unknown> = Promise.resolve();
  act(() => {
    create = editor().onSave({
      definition: definition("new"),
      title: "New",
      entityId: null,
    });
  });
  cleanup();

  graph.nets = [netA, netB, makeNet(createdId)];
  await act(async () => {
    lateCreate.resolve({ data: { createEntity: { entityId: createdId } } });
    await create;
  });

  expect(router.replace).not.toHaveBeenCalled();
});

test("a save finishing after another net loads keeps that net selected for its own saves", async () => {
  const lateRefetch = deferred<RefetchResult>();
  graph.refetchNets.mockReturnValueOnce(lateRefetch.promise);
  const { navigate } = await renderHost(savedView(uuidA));

  let saveA: Promise<unknown> = Promise.resolve();
  act(() => {
    saveA = editor().onSave({
      definition: definition("a2"),
      title: "A",
      entityId: netAId,
    });
  });
  await discardAndNavigate(navigate, savedView(uuidB));
  await waitFor(() =>
    expect(editor().load?.mode).toEqual({ kind: "saved", entityId: netBId }),
  );

  await act(async () => {
    lateRefetch.resolve({ data: { nets: graph.nets } });
    await saveA;
  });

  expect(observed.historyQueries.at(-1)).toBe(netBId);

  await act(() =>
    editor().onSave({
      definition: definition("b2"),
      title: "B",
      entityId: netBId,
    }),
  );
  expect(updatedEntityIds()).toEqual([netAId, netBId]);
});

test("unsaved changes guard the tab and a declined switch restores the URL", async () => {
  const { navigate } = await renderHost(savedView(uuidA));
  const loadA = editor().load;

  act(() => editor().onDirtyChange(true));
  const leave = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leave);
  expect(leave.defaultPrevented).toBe(true);

  navigate(savedView(uuidB));
  await waitFor(() => expect(observed.alert).not.toBeNull());
  act(() => observed.alert?.close());

  expect(router.replace).toHaveBeenCalledWith(`/processes/${uuidA}`);
  expect(editor().load).toBe(loadA);

  act(() => editor().onDirtyChange(false));
  const leaveClean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leaveClean);
  expect(leaveClean.defaultPrevented).toBe(false);
});
