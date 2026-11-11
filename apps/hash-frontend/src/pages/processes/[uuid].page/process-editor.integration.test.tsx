// @vitest-environment jsdom

/**
 * The process route with its real host, editor and Petrinaut composition:
 * `ProcessRoutePage` -> `ProcessEditor` -> the dynamically imported
 * `PetrinautEditor` -> `ProcessPetrinaut`, and the real persistence and
 * revision hooks. Only external edges are replaced: the Next router, Apollo's
 * network (the graph answers with real serialized subgraphs, which the real
 * SDK deserializes), Petrinaut's heavyweight editor (a stand-in that reads
 * the real top-bar context, as the top-bar plugin does), Brunch's networking,
 * Sentry and the design system's modal.
 */

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode, use, useLayoutEffect } from "react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { brunchTools, hashPetrinautTools } from "@hashintel/brunch-agent";
import { canonicalizePetrinautIds } from "@hashintel/petrinaut-core";

import ProcessRoutePage from "../[uuid].page";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import type { TopBarState } from "./process-editor/petrinaut-editor/top-bar-context";
import type { PetriNetRevision } from "./process-editor/use-process-save-and-load/use-petri-net-revisions";
import type * as ApolloClient from "@apollo/client";
import type { EntityId } from "@blockprotocol/type-system";
import type * as BrunchUi from "@hashintel/brunch-agent/ui";
import type { AlertModal } from "@hashintel/design-system";
import type {
  ErrorTracker,
  PetrinautDocHandle,
  PetrinautProps,
  SDCPN,
} from "@hashintel/petrinaut";
import type * as PetrinautCore from "@hashintel/petrinaut-core";
import type { ComponentProps, ComponentType, ReactNode } from "react";

type AlertProps = ComponentProps<typeof AlertModal>;
type BrunchInput = Parameters<typeof BrunchUi.useBrunchAssistant>[0];

/** A net in the fake graph, with its revisions oldest first. */
type GraphNet = {
  entityId: EntityId;
  editable: boolean;
  revisions: PetriNetRevision[];
};

/** What the Petrinaut stand-in last committed. */
type EditorView = {
  handle: PetrinautDocHandle;
  plugins: PetrinautProps["plugins"];
  readonly: boolean;
  title: PetrinautProps["title"];
  topBar: TopBarState;
  captureException: ErrorTracker["captureException"];
};

const titleUrl = "https://hash.ai/@h/types/property-type/title/";
const definitionUrl =
  "https://hash.ai/@h/types/property-type/definition-object/";

/**
 * The graph behind Apollo: answers queries from its nets as of when they
 * were (re)fetched, as Apollo's cache does, and applies writes, which a test
 * can hold or fail.
 */
const graph = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const store = {
    nets: new Map<string, GraphNet>(),
    /** The nets query has not answered yet. */
    listPending: false,
    cache: new Map<string, unknown>(),
    version: 0,
    nextTime: 1,
    /** Gates the next writes wait on before applying. */
    writeGates: [] as Promise<void>[],
    writeFailures: [] as Error[],
    /** Edit permission the next written net has afterwards. */
    editableAfterWrite: null as boolean | null,
    writes: [] as {
      kind: "create" | "update";
      entityId: EntityId;
      title: string;
      definition: unknown;
    }[],
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getVersion: () => store.version,
    notify: () => {
      store.version += 1;
      for (const listener of listeners) {
        listener();
      }
    },
  };
  return store;
});

const router = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  type RouterState = {
    isReady: boolean;
    asPath: string;
    query: Record<string, string>;
  };
  const state = {
    current: { isReady: false, asPath: "", query: {} } as RouterState,
  };
  const go = (url: string) => {
    const [path = "", search = ""] = url.split("?");
    const uuid = path.replace("/processes/", "");
    state.current = {
      isReady: true,
      asPath: url,
      query: { uuid, ...Object.fromEntries(new URLSearchParams(search)) },
    };
    for (const listener of listeners) {
      listener();
    }
  };
  /** Next applies a navigation after the call returns. */
  const navigate = (url: string) => {
    queueMicrotask(() => go(url));
    return Promise.resolve(true);
  };
  return {
    state,
    go,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    push: vi.fn(navigate),
    replace: vi.fn(navigate),
    events: { on: vi.fn(), off: vi.fn() },
  };
});

const observed = vi.hoisted(() => ({
  editor: null as EditorView | null,
  /** Each distinct handle Petrinaut committed, in order. */
  handles: [] as PetrinautDocHandle[],
  /** The input of Brunch's mounted session, or `null` when none is. */
  brunch: null as BrunchInput | null,
  alert: null as AlertProps | null,
}));

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
const brunchPluginMarker = vi.hoisted(() => ({ id: "brunch" }));
const brunchHostContext = await vi.hoisted(async () => {
  const { createContext } = await import("react");
  return createContext<BrunchUi.BrunchAssistantHost | null>(null);
});

vi.mock("next/router", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => {
      const state = useSyncExternalStore(
        router.subscribe,
        () => router.state.current,
      );
      return {
        ...state,
        push: router.push,
        replace: router.replace,
        events: router.events,
      };
    },
  };
});

/** Loads the module the host asks for, as `next/dynamic` does on the client. */
vi.mock("next/dynamic", async () => {
  const { createElement, lazy, Suspense } = await import("react");
  return {
    default: <Props extends object>(
      loader: () => Promise<ComponentType<Props>>,
      options?: { loading?: () => ReactNode },
    ) => {
      const Loaded = lazy(async () => ({ default: await loader() }));
      return (props: Props) =>
        createElement(
          Suspense,
          { fallback: options?.loading?.() ?? null },
          createElement(Loaded, props),
        );
    },
  };
});

vi.mock("../../../shared/layout", () => ({
  getLayoutWithSidebar: (page: ReactNode) => page,
}));

vi.mock("../../../lib/public-env", () => ({
  brunchAgentOrigin: "https://brunch.test",
}));

vi.mock("../../shared/auth-info-context", () => ({
  useAuthInfo: () => ({
    authenticatedUser: {
      accountId: "alice-account",
      accountSignupComplete: true,
    },
  }),
}));

vi.mock("../../shared/workspace-context", () => ({
  useActiveWorkspace: () => ({
    activeWorkspaceWebId: "00000000-0000-4000-8000-000000000001",
  }),
}));

vi.mock("@sentry/nextjs", () => sentry);

vi.mock("@hashintel/design-system", () => ({
  AlertModal: (props: AlertProps) => {
    useLayoutEffect(() => {
      observed.alert = props;
    });
    useLayoutEffect(
      () => () => {
        observed.alert = null;
      },
      [],
    );
    return null;
  },
}));

/**
 * Petrinaut's real document core, and a stand-in for its editor that commits
 * what it was given and what its top-bar items would read.
 */
vi.mock("@hashintel/petrinaut", async () => {
  const core = await vi.importActual<typeof PetrinautCore>(
    "@hashintel/petrinaut-core",
  );
  const { createContext } = await import("react");
  const { TopBarContext } =
    await import("./process-editor/petrinaut-editor/top-bar-context");
  const ErrorTrackerContext = createContext<ErrorTracker>({
    captureException: () => {},
  });
  const Petrinaut = ({ handle, plugins, readonly, title }: PetrinautProps) => {
    const topBar = use(TopBarContext);
    const { captureException } = use(ErrorTrackerContext);
    // Brunch is the only assistant, so the editor shows it while listed.
    const show = use(brunchHostContext)?.show;
    const brunchListed = plugins?.includes(brunchPluginMarker as never);
    useLayoutEffect(
      () => (brunchListed ? show?.(handle.id) : undefined),
      [brunchListed, show, handle.id],
    );
    useLayoutEffect(() => {
      if (!topBar) {
        throw new Error("Petrinaut rendered outside the top-bar context");
      }
      if (observed.handles.at(-1) !== handle) {
        observed.handles.push(handle);
      }
      observed.editor = {
        handle,
        plugins,
        readonly: readonly ?? false,
        title,
        topBar,
        captureException,
      };
    });
    return null;
  };
  return {
    createJsonDocHandle: core.createJsonDocHandle,
    isSDCPNEqual: core.isSDCPNEqual,
    normalizeSDCPN: core.normalizeSDCPN,
    ErrorTrackerContext,
    Petrinaut,
  };
});

/** Petrinaut renders the top bar's items; its stand-in reads their context. */
vi.mock(
  "./process-editor/petrinaut-editor/process-petrinaut/top-bar-plugin",
  () => ({ topBarPlugin: { id: "top-bar" } }),
);

vi.hoisted(() => {
  window.matchMedia = (media) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  });
});

vi.mock("@hashintel/brunch-agent/ui", async (importOriginal) => ({
  createHashPetrinautSaveTool: (await importOriginal<typeof BrunchUi>())
    .createHashPetrinautSaveTool,
  BrunchAssistantContext: brunchHostContext,
  brunchPlugin: brunchPluginMarker,
  // Stand-ins named for HASH's real Petrinaut tools; Brunch runs them.
  hashPetrinautHostTools: Object.keys(
    (await import("@hashintel/brunch-agent")).hashPetrinautTools,
  ).map((toolName) => ({ toolName })),
  useBrunchAssistant: (input: BrunchInput) => {
    useLayoutEffect(() => {
      observed.brunch = input;
    });
    useLayoutEffect(
      () => () => {
        observed.brunch = null;
      },
      [],
    );
    return { assistant: null, openAIVoiceConfig: null };
  },
}));

/** Apollo's hooks over the fake graph; documents and SDK stay real. */
vi.mock("@apollo/client", async (importOriginal) => {
  const original = await importOriginal<typeof ApolloClient>();
  const { useCallback, useSyncExternalStore } = await import("react");

  const queryKey = ({
    request: { filter },
  }: QueryEntitySubgraphQueryVariables): string => {
    if ("all" in filter) {
      const uuidFilter = JSON.stringify(filter.all[0]);
      const net = [...graph.nets.values()].find(({ entityId }) =>
        uuidFilter.includes(entityId.split("~")[1] ?? "~"),
      );
      return `history:${net?.entityId ?? "none"}`;
    }
    return "nets";
  };

  const vertex = (entityId: EntityId, revision: PetriNetRevision) => ({
    kind: "entity",
    inner: {
      metadata: {
        recordId: { entityId, editionId: revision.decisionTime },
        entityTypeIds: ["https://hash.ai/@h/types/entity-type/petri-net/v/1"],
        temporalVersioning: {
          decisionTime: {
            start: { kind: "inclusive", limit: revision.decisionTime },
            end: { kind: "unbounded" },
          },
          transactionTime: {
            start: { kind: "inclusive", limit: revision.decisionTime },
            end: { kind: "unbounded" },
          },
        },
      },
      properties: {
        [titleUrl]: revision.title,
        [definitionUrl]: revision.definition,
      },
    },
  });

  /** The server's answer to a query, as serialized JSON. */
  const answer = (key: string): QueryEntitySubgraphQuery => {
    const entries: [EntityId, PetriNetRevision][] =
      key === "nets"
        ? [...graph.nets.values()].flatMap(({ entityId, revisions }) => {
            const latest = revisions.at(-1);
            return latest ? [[entityId, latest] as const] : [];
          })
        : (graph.nets
            .get(key.replace("history:", ""))
            ?.revisions.map((revision) => [
              graph.nets.get(key.replace("history:", ""))!.entityId,
              revision,
            ]) ?? []);
    const vertices: Record<string, Record<string, unknown>> = {};
    for (const [entityId, revision] of entries) {
      vertices[entityId] = {
        ...vertices[entityId],
        [revision.decisionTime]: vertex(entityId, revision),
      };
    }
    return JSON.parse(
      JSON.stringify({
        queryEntitySubgraph: {
          subgraph: {
            roots: entries.map(([entityId, { decisionTime }]) => ({
              baseId: entityId,
              revisionId: decisionTime,
            })),
            vertices,
            edges: {},
            temporalAxes: {},
          },
          entityPermissions: Object.fromEntries(
            [...graph.nets.values()].map(({ entityId, editable }) => [
              entityId,
              { update: editable },
            ]),
          ),
        },
      }),
    ) as QueryEntitySubgraphQuery;
  };

  const read = (key: string): QueryEntitySubgraphQuery | undefined => {
    if (!graph.cache.has(key)) {
      if (key === "nets" && graph.listPending) {
        return undefined;
      }
      graph.cache.set(key, answer(key));
    }
    return graph.cache.get(key) as QueryEntitySubgraphQuery;
  };

  const useQuery = (
    _query: unknown,
    {
      skip,
      variables,
    }: { skip?: boolean; variables: QueryEntitySubgraphQueryVariables },
  ) => {
    useSyncExternalStore(graph.subscribe, graph.getVersion);
    const key = skip ? null : queryKey(variables);
    const data = key === null ? undefined : read(key);
    const refetch = useCallback(() => {
      const refetched = key ?? queryKey(variables);
      const fresh = answer(refetched);
      graph.cache.set(refetched, fresh);
      graph.notify();
      return Promise.resolve({ data: fresh });
      // Stable while the key is, as Apollo's is.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return { data, loading: key !== null && data === undefined, refetch };
  };

  /** The client Brunch's graph reads use; these tests make no reads. */
  const apolloClient = {
    query: () => Promise.reject(new Error("Unexpected graph read")),
  };
  const useApolloClient = () => apolloClient;

  const write = async (
    kind: "create" | "update",
    entityId: EntityId,
    title: string,
    definition: unknown,
  ) => {
    graph.writes.push({ kind, entityId, title, definition });
    await graph.writeGates.shift();
    const failure = graph.writeFailures.shift();
    if (failure) {
      throw failure;
    }
    const net = graph.nets.get(entityId) ?? {
      entityId,
      editable: true,
      revisions: [],
    };
    net.revisions.push({
      decisionTime: `2026-10-24T01:${String(graph.nextTime++).padStart(2, "0")}:00.000Z`,
      title,
      definition: definition as SDCPN,
    });
    net.editable = graph.editableAfterWrite ?? net.editable;
    graph.editableAfterWrite = null;
    graph.nets.set(entityId, net);
  };

  const useMutation = (mutation: {
    definitions: readonly { name?: { value: string } }[];
  }) => {
    const name = mutation.definitions[0]?.name?.value;
    if (name === "updateEntity") {
      return [
        async ({
          variables: { entityUpdate },
        }: {
          variables: UpdateEntityMutationVariables;
        }) => {
          const value = (url: string) =>
            (
              entityUpdate.propertyPatches.find(
                (patch) => patch.op === "replace" && patch.path[0] === url,
              ) as { property: { value: unknown } } | undefined
            )?.property.value;
          await write(
            "update",
            entityUpdate.entityId,
            value(titleUrl) as string,
            value(definitionUrl),
          );
          return { data: { updateEntity: {} } };
        },
      ];
    }
    if (name === "createEntity") {
      return [
        async ({
          variables: { properties, webId: createdIn, entityUuid },
        }: {
          variables: {
            properties: { value: Record<string, { value: unknown }> };
            webId?: string;
            entityUuid?: string;
          };
        }) => {
          // As the graph does: the caller names the new entity and its web.
          if (!createdIn || !entityUuid) {
            throw new Error("The create named no web or uuid for its entity");
          }
          const entityId = `${createdIn}~${entityUuid}` as EntityId;
          await write(
            "create",
            entityId,
            properties.value[titleUrl]?.value as string,
            properties.value[definitionUrl]?.value,
          );
          return {
            data: {
              createEntity: vertex(
                entityId,
                graph.nets.get(entityId)!.revisions.at(-1)!,
              ).inner,
            },
          };
        },
      ];
    }
    return [() => Promise.reject(new Error(`Unexpected mutation ${name}`))];
  };

  return { ...original, useQuery, useMutation, useApolloClient };
});

const webId = "00000000-0000-4000-8000-000000000001";
const uuidA = "00000000-0000-4000-8000-00000000000a";
const uuidB = "00000000-0000-4000-8000-00000000000b";
const uuidCreated = "00000000-0000-4000-8000-00000000000c";
const netAId = `${webId}~${uuidA}` as EntityId;
const netBId = `${webId}~${uuidB}` as EntityId;
const createdId = `${webId}~${uuidCreated}` as EntityId;
/** A draft's URL names the net its first save creates, and that net's web. */
const draftUrl = `/processes/${uuidCreated}?draftWeb=${webId}`;
const firstSaved = "2026-10-24T00:00:00.000Z";

/** A net whose place has a legacy (non-UUID) id, which a load converts. */
const definition = (name: string): SDCPN => ({
  places: [
    {
      id: `place-${name}`,
      name,
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
});

const graphNet = (
  entityId: EntityId,
  name: string,
  editable = true,
): GraphNet => ({
  entityId,
  editable,
  revisions: [
    { decisionTime: firstSaved, title: name, definition: definition(name) },
  ],
});

const deferred = () => {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

/** Holds the next graph write until the returned call. */
const holdNextWrite = () => {
  const gate = deferred();
  graph.writeGates.push(gate.promise);
  return gate.resolve;
};

// Initialize the real save tool's UI module graph outside the editor's mount wait.
beforeAll(async () => {
  await import("@hashintel/brunch-agent/ui");
});

beforeEach(() => {
  graph.nets = new Map([
    [netAId, graphNet(netAId, "A")],
    [netBId, graphNet(netBId, "B")],
  ]);
  graph.listPending = false;
  graph.cache.clear();
  graph.nextTime = 1;
  graph.writeGates.length = 0;
  graph.writeFailures.length = 0;
  graph.editableAfterWrite = null;
  graph.writes.length = 0;
  router.state.current = { isReady: false, asPath: "", query: {} };
  router.push.mockClear();
  router.replace.mockClear();
  observed.editor = null;
  observed.handles.length = 0;
  observed.brunch = null;
  observed.alert = null;
  sentry.captureException.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ actorKey: "hash:alice-account" })),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const editor = (): EditorView => {
  if (!observed.editor) {
    throw new Error("Petrinaut has not rendered");
  }
  return observed.editor;
};
const topBar = () => editor().topBar;
const url = () => router.state.current.asPath;

/** Lets pending saves, navigations and their renders finish. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });

const navigate = async (to: string) => {
  act(() => router.go(to));
  await settle();
};

/** Renders the route at `at` and waits for the editor to show its net. */
const renderRoute = async (at: string | null) => {
  if (at !== null) {
    router.go(at);
  }
  const rendered = render(
    <StrictMode>
      <ProcessRoutePage />
    </StrictMode>,
  );
  if (at !== null) {
    await waitFor(() => expect(observed.editor).not.toBeNull());
    await settle();
  }
  return rendered;
};

const pressSave = () => act(() => topBar().onSave());

const leaveIsBlocked = () => {
  const leave = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leave);
  return leave.defaultPrevented;
};

const editTitle = (title: string) => act(() => topBar().onTitleChange(title));

const renamePlace = (name: string) =>
  act(() =>
    editor().handle.change((draft) => {
      draft.places[0]!.name = name;
    }),
  );

test("each deliberate load opens a fresh handle; rerenders, history, permission and save completion keep it", async () => {
  graph.listPending = true;
  await renderRoute(null);
  await settle();
  expect(observed.editor).toBeNull();

  // The URL names a net before the nets query has answered.
  await navigate(`/processes/${uuidA}`);
  expect(observed.editor).toBeNull();

  graph.listPending = false;
  act(() => graph.notify());
  await waitFor(() => expect(observed.editor).not.toBeNull());
  await settle();
  const first = editor().handle;
  expect(first.doc()).toEqual(canonicalizePetrinautIds(definition("A")));
  expect(topBar()).toMatchObject({
    title: "A",
    readonly: false,
    isDirty: false,
    saveLabel: "Saved",
    loadedRevisionTime: firstSaved,
    revisions: [{ decisionTime: firstSaved, title: "A" }],
  });
  expect(observed.brunch?.openDocument).toMatchObject({
    documentId: netAId,
    editor: { handle: first },
  });
  expect(observed.brunch?.hostTools?.map(({ toolName }) => toolName)).toEqual([
    brunchTools.hashQueryEntities,
    brunchTools.hashQueryEntityTypes,
    brunchTools.hashQueryWebs,
    ...Object.keys(hashPetrinautTools),
  ]);
  expect(observed.brunch?.hostSave).toBeDefined();

  // The route rerendering with the same URL is not a load.
  await navigate(`/processes/${uuidA}`);
  expect(editor().handle).toBe(first);

  // Saving refreshes the history, which is not a load either.
  editTitle("A2");
  pressSave();
  await settle();
  expect(topBar().revisions.map(({ title }) => title)).toEqual(["A2", "A"]);
  expect(topBar()).toMatchObject({ isDirty: false, saveLabel: "Saved" });
  expect(editor().handle).toBe(first);
  expect(observed.handles).toEqual([first]);

  // Picking the revision the editor already shows is a deliberate load.
  const [latest] = topBar().revisions;
  act(() => topBar().onLoadRevision(latest!));
  await settle();
  const second = editor().handle;
  expect(second).not.toBe(first);
  expect(second.doc()).toEqual(first.doc());
  expect(observed.brunch?.openDocument?.editor?.handle).toBe(second);

  // A save after which the user may no longer edit makes the net readonly
  // and withdraws Brunch, in the same editor.
  graph.editableAfterWrite = false;
  editTitle("A3");
  pressSave();
  await settle();
  expect(editor()).toMatchObject({ readonly: true, handle: second });
  expect(topBar()).toMatchObject({ readonly: true, isDirty: false });
  expect(observed.brunch).toBeNull();
  expect(editor().plugins).not.toContain(brunchPluginMarker);
  expect(observed.handles).toEqual([first, second]);
});

test("Create turns the draft into the saved net in the same editor, under its URL, with its history and Brunch", async () => {
  await renderRoute(draftUrl);
  const draft = editor().handle;
  expect(topBar()).toMatchObject({ saveLabel: "Create", isDirty: true });
  expect(observed.brunch).toBeNull();
  editTitle("New net");

  pressSave();
  await settle();

  expect(graph.writes).toEqual([
    {
      kind: "create",
      entityId: createdId,
      title: "New net",
      definition: draft.doc(),
    },
  ]);
  expect(router.replace).toHaveBeenCalledExactlyOnceWith(
    `/processes/${uuidCreated}`,
  );
  expect(url()).toBe(`/processes/${uuidCreated}`);
  expect(editor().handle).toBe(draft);
  expect(observed.handles).toEqual([draft]);
  expect(topBar()).toMatchObject({ saveLabel: "Saved", isDirty: false });
  expect(topBar().revisions).toHaveLength(1);
  expect(topBar().loadedRevisionTime).toBe(topBar().revisions[0]?.decisionTime);
  expect(observed.brunch?.openDocument).toMatchObject({
    documentId: createdId,
    editor: { handle: draft },
  });
  expect(leaveIsBlocked()).toBe(false);
});

test("unsaved edits guard the tab and the switch; declining keeps them, discarding loads the other net", async () => {
  await renderRoute(`/processes/${uuidA}`);
  const handleA = editor().handle;
  expect(leaveIsBlocked()).toBe(false);

  renamePlace("edited");
  await settle();
  expect(topBar().isDirty).toBe(true);
  expect(leaveIsBlocked()).toBe(true);

  await navigate(`/processes/${uuidB}`);
  expect(observed.alert).not.toBeNull();
  act(() => observed.alert?.close());
  await settle();

  expect(observed.alert).toBeNull();
  expect(url()).toBe(`/processes/${uuidA}`);
  expect(editor().handle).toBe(handleA);
  expect(handleA.doc()?.places[0]?.name).toBe("edited");
  expect(topBar().isDirty).toBe(true);
  expect(leaveIsBlocked()).toBe(true);

  await navigate(`/processes/${uuidB}`);
  act(() => observed.alert?.callback?.());
  await settle();

  expect(editor().handle).not.toBe(handleA);
  expect(editor().handle.doc()).toEqual(
    canonicalizePetrinautIds(definition("B")),
  );
  expect(topBar()).toMatchObject({ title: "B", isDirty: false });
  expect(observed.brunch?.openDocument?.documentId).toBe(netBId);
  expect(leaveIsBlocked()).toBe(false);
});

test("Save persists the net as pressed, returns its history, and keeps edits made meanwhile unsaved", async () => {
  await renderRoute(`/processes/${uuidA}`);
  const handle = editor().handle;
  renamePlace("submitted");
  editTitle("A submitted");
  const submitted = structuredClone(handle.doc());

  const release = holdNextWrite();
  pressSave();
  await settle();
  expect(topBar().persistPending).toBe(true);
  expect(graph.writes).toEqual([
    {
      kind: "update",
      entityId: netAId,
      title: "A submitted",
      definition: submitted,
    },
  ]);
  // The legacy id goes out converted.
  expect(submitted?.places[0]?.id).not.toBe("place-A");

  renamePlace("later");
  editTitle("A later");
  act(() => release());
  await settle();

  const saved = graph.nets.get(netAId)?.revisions.at(-1);
  expect(saved).toMatchObject({ title: "A submitted", definition: submitted });
  expect(topBar()).toMatchObject({
    persistPending: false,
    loadedRevisionTime: saved?.decisionTime,
    isDirty: true,
    saveLabel: "Save",
    title: "A later",
  });
  expect(topBar().revisions).toEqual([
    { decisionTime: saved?.decisionTime, title: "A submitted" },
    { decisionTime: firstSaved, title: "A" },
  ]);
  expect(editor().handle).toBe(handle);
  expect(leaveIsBlocked()).toBe(true);

  // Undoing the later edits returns to exactly what was saved.
  renamePlace("submitted");
  editTitle("A submitted");
  await settle();
  expect(topBar().isDirty).toBe(false);
  expect(leaveIsBlocked()).toBe(false);
});

test("a Create finishing after another net loads leaves that net, its URL, history and Brunch", async () => {
  await renderRoute(draftUrl);
  const release = holdNextWrite();
  pressSave();
  await settle();

  await navigate(`/processes/${uuidB}`);
  act(() => observed.alert?.callback?.());
  await settle();
  const handleB = editor().handle;
  expect(topBar()).toMatchObject({ title: "B", persistPending: false });

  act(() => release());
  await settle();

  expect(graph.nets.has(createdId)).toBe(true);
  expect(router.replace).not.toHaveBeenCalled();
  expect(url()).toBe(`/processes/${uuidB}`);
  expect(editor().handle).toBe(handleB);
  expect(topBar()).toMatchObject({
    title: "B",
    saveLabel: "Saved",
    loadedRevisionTime: firstSaved,
    revisions: [{ decisionTime: firstSaved, title: "B" }],
  });
  expect(observed.brunch?.openDocument?.documentId).toBe(netBId);

  // B's own saves still go to B and refresh B's history.
  editTitle("B2");
  pressSave();
  await settle();
  expect(graph.writes.map(({ entityId }) => entityId)).toEqual([
    createdId,
    netBId,
  ]);
  expect(topBar().revisions.map(({ title }) => title)).toEqual(["B2", "B"]);
  expect(url()).toBe(`/processes/${uuidB}`);
});

test("an update finishing after another net loads leaves that net's selection, permission and editor", async () => {
  await renderRoute(`/processes/${uuidA}`);
  editTitle("A2");
  graph.editableAfterWrite = false;
  const release = holdNextWrite();
  pressSave();
  await settle();

  await navigate(`/processes/${uuidB}`);
  act(() => observed.alert?.callback?.());
  await settle();
  const handleB = editor().handle;

  act(() => release());
  await settle();

  expect(graph.nets.get(netAId)?.revisions).toHaveLength(2);
  expect(editor()).toMatchObject({ handle: handleB, readonly: false });
  expect(topBar()).toMatchObject({
    title: "B",
    isDirty: false,
    loadedRevisionTime: firstSaved,
    revisions: [{ decisionTime: firstSaved, title: "B" }],
  });
  expect(observed.brunch?.openDocument?.documentId).toBe(netBId);
  expect(router.replace).not.toHaveBeenCalled();

  editTitle("B2");
  pressSave();
  await settle();
  expect(graph.writes.map(({ entityId }) => entityId)).toEqual([
    netAId,
    netBId,
  ]);
  expect(topBar().revisions.map(({ title }) => title)).toEqual(["B2", "B"]);
});

test("a pending save takes no second press, and a failed save settles and can be retried", async () => {
  await renderRoute(`/processes/${uuidA}`);
  editTitle("A2");

  graph.writeFailures.push(new Error("graph unavailable"));
  const release = holdNextWrite();
  pressSave();
  await settle();
  // Pressed again once the pending state has rendered.
  expect(topBar().persistPending).toBe(true);
  pressSave();
  await settle();
  expect(graph.writes).toHaveLength(1);

  act(() => release());
  await settle();

  expect(topBar()).toMatchObject({
    persistPending: false,
    isDirty: true,
    saveLabel: "Save",
    loadedRevisionTime: firstSaved,
    revisions: [{ decisionTime: firstSaved, title: "A" }],
  });
  expect(url()).toBe(`/processes/${uuidA}`);
  expect(leaveIsBlocked()).toBe(true);

  pressSave();
  await settle();

  expect(graph.writes).toHaveLength(2);
  expect(topBar()).toMatchObject({ persistPending: false, isDirty: false });
  expect(topBar().revisions.map(({ title }) => title)).toEqual(["A2", "A"]);
  expect(leaveIsBlocked()).toBe(false);
});

test("Save called twice before the editor rerenders writes once, for Create and for an update", async () => {
  await renderRoute(draftUrl);
  const draftBar = topBar();

  act(() => {
    draftBar.onSave();
    draftBar.onSave();
  });
  await settle();

  expect(graph.writes.map(({ kind }) => kind)).toEqual(["create"]);
  expect(router.replace).toHaveBeenCalledExactlyOnceWith(
    `/processes/${uuidCreated}`,
  );
  expect(topBar()).toMatchObject({ saveLabel: "Saved", isDirty: false });

  editTitle("Created 2");
  const savedBar = topBar();
  act(() => {
    savedBar.onSave();
    savedBar.onSave();
  });
  await settle();

  expect(graph.writes.map(({ kind }) => kind)).toEqual(["create", "update"]);
  expect(topBar()).toMatchObject({ persistPending: false, isDirty: false });
});

test("Save submits the title as it is when called, even one changed in the same tick", async () => {
  await renderRoute(`/processes/${uuidA}`);
  const bar = topBar();

  act(() => {
    bar.onTitleChange("A renamed");
    bar.onSave();
  });
  await settle();

  expect(graph.writes).toMatchObject([
    { kind: "update", entityId: netAId, title: "A renamed" },
  ]);
  expect(topBar()).toMatchObject({ title: "A renamed", isDirty: false });
});

test("a Save kept from before Create, called after Create resolves, saves to the created net", async () => {
  await renderRoute(draftUrl);
  const draftBar = topBar();
  const release = holdNextWrite();
  act(() => draftBar.onSave());
  await settle();
  act(() => release());
  await settle();
  expect(topBar()).toMatchObject({ saveLabel: "Saved", isDirty: false });

  act(() => {
    draftBar.onTitleChange("Created renamed");
    draftBar.onSave();
  });
  await settle();

  expect(graph.writes).toMatchObject([
    { kind: "create", entityId: createdId },
    { kind: "update", entityId: createdId, title: "Created renamed" },
  ]);
  expect(router.replace).toHaveBeenCalledExactlyOnceWith(
    `/processes/${uuidCreated}`,
  );
  expect(url()).toBe(`/processes/${uuidCreated}`);
  expect(topBar()).toMatchObject({
    title: "Created renamed",
    saveLabel: "Saved",
    isDirty: false,
  });
});

test("a title change or Save kept from an earlier load does nothing once another net loads", async () => {
  await renderRoute(`/processes/${uuidA}`);
  editTitle("A2");
  const barA = topBar();

  await navigate(`/processes/${uuidB}`);
  act(() => observed.alert?.callback?.());
  await settle();
  const handleB = editor().handle;

  act(() => {
    barA.onTitleChange("A3");
    barA.onSave();
  });
  await settle();

  expect(graph.writes).toEqual([]);
  expect(editor().handle).toBe(handleB);
  expect(topBar()).toMatchObject({
    title: "B",
    persistPending: false,
    isDirty: false,
  });

  // B's own saves still go to B.
  editTitle("B2");
  pressSave();
  await settle();
  expect(graph.writes.map(({ entityId }) => entityId)).toEqual([netBId]);
  expect(editor()).toMatchObject({ handle: handleB, readonly: false });
  expect(url()).toBe(`/processes/${uuidB}`);
});

test("a save pending for an earlier load neither blocks the next load's save nor ends its pending state", async () => {
  await renderRoute(`/processes/${uuidA}`);
  editTitle("A2");
  const releaseA = holdNextWrite();
  pressSave();
  await settle();

  await navigate(`/processes/${uuidB}`);
  act(() => observed.alert?.callback?.());
  await settle();
  editTitle("B2");
  const releaseB = holdNextWrite();
  pressSave();
  await settle();
  expect(graph.writes.map(({ entityId }) => entityId)).toEqual([
    netAId,
    netBId,
  ]);

  act(() => releaseA());
  await settle();
  expect(topBar().persistPending).toBe(true);
  pressSave();
  await settle();
  expect(graph.writes).toHaveLength(2);

  act(() => releaseB());
  await settle();
  expect(topBar()).toMatchObject({
    persistPending: false,
    isDirty: false,
    title: "B2",
  });
  expect(topBar().revisions.map(({ title }) => title)).toEqual(["B2", "B"]);
});

test("a failed Create stays on the draft, and its retry creates the net and moves the URL", async () => {
  await renderRoute(draftUrl);
  const draft = editor().handle;
  graph.writeFailures.push(new Error("graph unavailable"));

  pressSave();
  await settle();

  expect(router.replace).not.toHaveBeenCalled();
  expect(url()).toBe(draftUrl);
  expect(topBar()).toMatchObject({
    persistPending: false,
    saveLabel: "Create",
    isDirty: true,
  });

  pressSave();
  await settle();

  expect(url()).toBe(`/processes/${uuidCreated}`);
  expect(editor().handle).toBe(draft);
  expect(topBar()).toMatchObject({ saveLabel: "Saved", isDirty: false });
});

test("starting a draft gives it an id in the active workspace, carried in its URL and kept by its first save", async () => {
  await renderRoute("/processes/draft");

  const [, uuid, web] =
    /^\/processes\/([0-9a-f-]{36})\?draftWeb=(.+)$/u.exec(url()) ?? [];
  expect(uuid).toBeDefined();
  expect(web).toBe(webId);
  expect(topBar()).toMatchObject({ saveLabel: "Create" });

  pressSave();
  await settle();

  expect(graph.writes).toEqual([
    expect.objectContaining({ kind: "create", entityId: `${webId}~${uuid}` }),
  ]);
  expect(url()).toBe(`/processes/${uuid}`);
});

test("a draft's URL opens the saved net once a net exists under its id", async () => {
  graph.nets.set(createdId, graphNet(createdId, "Saved elsewhere"));

  await renderRoute(draftUrl);

  expect(topBar()).toMatchObject({
    title: "Saved elsewhere",
    saveLabel: "Saved",
  });
  // Saving it updates that net; nothing is created a second time.
  pressSave();
  await settle();
  expect(graph.writes.map(({ kind }) => kind)).toEqual(["update"]);
});

test("contained failures reach Sentry as thrown, tagged with the net and permission the host loaded", async () => {
  graph.nets.set(netBId, graphNet(netBId, "B", false));
  await renderRoute(`/processes/${uuidB}`);

  // A net the user may not edit is readonly and gets no Brunch.
  expect(editor().readonly).toBe(true);
  expect(observed.brunch).toBeNull();
  expect(editor().plugins).not.toContain(brunchPluginMarker);

  const readonlyFailure = new Error("plugin failed");
  act(() =>
    editor().captureException(readonlyFailure, {
      source: "plugin",
      tags: { "petrinaut.plugin": "test" },
    }),
  );
  expect(sentry.captureException).toHaveBeenLastCalledWith(readonlyFailure, {
    tags: {
      "petrinaut.plugin": "test",
      "petrinaut.origin": "plugin",
      "petrinaut.source": "petrinaut",
      "petrinaut.mode": "saved",
    },
    contexts: {
      petrinaut: { mode: { kind: "saved", entityId: netBId }, readonly: true },
    },
  });

  // A draft turned into a saved net by Create reports as that net.
  await navigate(draftUrl);
  pressSave();
  await settle();
  const createdFailure = new Error("brunch failed");
  act(() =>
    editor().captureException(createdFailure, { source: "brunch.history" }),
  );
  expect(sentry.captureException).toHaveBeenLastCalledWith(createdFailure, {
    tags: {
      "petrinaut.origin": "brunch.history",
      "petrinaut.source": "petrinaut",
      "petrinaut.mode": "saved",
    },
    contexts: {
      petrinaut: {
        mode: { kind: "saved", entityId: createdId },
        readonly: false,
      },
    },
  });
});

/** Runs Brunch's save as its panel does once the user approves it. */
const agentSave = (
  documentId: string,
  signal = new AbortController().signal,
) => {
  const hostSave = observed.brunch?.hostSave;
  if (!hostSave) {
    throw new Error("The page gave Brunch no save");
  }
  return hostSave.save(documentId, signal);
};

test("Brunch's agent save writes the open net through the editor's Save, and settles once saved with the edits made meanwhile still dirty", async () => {
  await renderRoute(`/processes/${uuidA}`);
  renamePlace("A-agent");
  const submitted = editor().handle.doc();
  const release = holdNextWrite();

  const saved = agentSave(netAId);
  await settle();
  expect(topBar().persistPending).toBe(true);
  // Another agent save starts nothing meanwhile.
  await expect(agentSave(netAId)).resolves.toEqual({
    status: "not-started",
    reason: "A save of this net is already in progress.",
  });
  renamePlace("A-later");

  act(() => release());
  await settle();

  const decisionTime = graph.nets.get(netAId)?.revisions.at(-1)?.decisionTime;
  await expect(saved).resolves.toEqual({
    status: "saved",
    decisionTime,
    title: "A",
    stillDirty: true,
  });
  expect(graph.writes).toEqual([
    { kind: "update", entityId: netAId, title: "A", definition: submitted },
  ]);
  expect(topBar()).toMatchObject({
    isDirty: true,
    persistPending: false,
    loadedRevisionTime: decisionTime,
  });
  expect(topBar().revisions.map(({ title }) => title)).toEqual(["A", "A"]);
  expect(leaveIsBlocked()).toBe(true);

  // An aborted agent save rejects, and the write it started still lands.
  const releaseNext = holdNextWrite();
  const controller = new AbortController();
  const aborted = agentSave(netAId, controller.signal);
  controller.abort(new Error("Brunch stopped the turn"));
  await expect(aborted).rejects.toThrow("Brunch stopped the turn");
  act(() => releaseNext());
  await settle();
  expect(graph.writes).toHaveLength(2);
  expect(topBar()).toMatchObject({ isDirty: false, persistPending: false });
});

test("picking an earlier revision tells Brunch of a version load, which Saves keep and opening another net clears", async () => {
  await renderRoute(`/processes/${uuidA}`);
  expect(observed.brunch?.versionLoad).toBeUndefined();
  editTitle("A2");
  pressSave();
  await settle();
  const [latest, first] = topBar().revisions;
  expect(first?.decisionTime).toBe(firstSaved);

  // The version the editor already shows is no version load.
  act(() => topBar().onLoadRevision(latest!));
  await settle();
  expect(observed.brunch?.versionLoad).toBeUndefined();

  act(() => topBar().onLoadRevision(first!));
  await settle();
  const versionLoad = observed.brunch?.versionLoad;
  expect(versionLoad).toEqual({
    id: expect.any(String),
    decisionTime: firstSaved,
  });

  editTitle("A3");
  pressSave();
  await settle();
  expect(topBar().revisions.map(({ title }) => title)).toEqual([
    "A3",
    "A2",
    "A",
  ]);
  expect(observed.brunch?.versionLoad).toBe(versionLoad);

  // Picking it again is another load, with a fresh id.
  act(() => topBar().onLoadRevision(topBar().revisions.at(-1)!));
  await settle();
  expect(observed.brunch?.versionLoad?.decisionTime).toBe(firstSaved);
  expect(observed.brunch?.versionLoad?.id).not.toBe(versionLoad?.id);

  await navigate(`/processes/${uuidB}`);
  await settle();
  expect(editor().title).toBe("B");
  expect(observed.brunch?.versionLoad).toBeUndefined();
});

test("leaving a net while Brunch's agent save of it is pending settles the save as unconfirmed, and its write still lands", async () => {
  await renderRoute(`/processes/${uuidA}`);
  renamePlace("A-agent");
  const release = holdNextWrite();
  const saved = agentSave(netAId);
  await settle();
  expect(topBar().persistPending).toBe(true);

  // The edits are still unsaved, so leaving asks to discard them.
  await navigate(`/processes/${uuidB}`);
  act(() => observed.alert?.callback?.());
  await settle();
  expect(topBar().title).toBe("B");
  await expect(saved).resolves.toEqual({
    status: "unconfirmed",
    error: "The editor reloaded before the save was confirmed.",
  });

  act(() => release());
  await settle();
  expect(graph.writes.map(({ entityId }) => entityId)).toEqual([netAId]);
  expect(topBar()).toMatchObject({ title: "B", persistPending: false });
  expect(url()).toBe(`/processes/${uuidB}`);
});

test("an update save's editability reaches its own load, including Brunch's save state, and never a later load of the same net", async () => {
  await renderRoute(`/processes/${uuidA}`);
  const firstHandle = editor().handle;
  const readSaveState = observed.brunch?.hostSave?.read;
  editTitle("A2");
  expect(readSaveState?.(netAId).refusal).toBeNull();

  // A save after which the user may no longer edit: the same load turns
  // read-only, keeping its handle, and Brunch's save state refuses.
  graph.editableAfterWrite = false;
  pressSave();
  await settle();
  expect(editor()).toMatchObject({ readonly: true, handle: firstHandle });
  expect(readSaveState?.(netAId).refusal).toBe(
    "The user can't edit this net, so they can't save it.",
  );
});

test("an update save finishing after the user picks a revision of the same net leaves that later load's editability as it was", async () => {
  await renderRoute(`/processes/${uuidA}`);
  editTitle("A2");
  pressSave();
  await settle();
  graph.editableAfterWrite = false;
  editTitle("A3");
  const release = holdNextWrite();
  pressSave();
  await settle();
  const [, earlier] = topBar().revisions;
  act(() => topBar().onLoadRevision(earlier!));
  await settle();
  const pickedHandle = editor().handle;

  act(() => release());
  await settle();
  expect(graph.nets.get(netAId)?.editable).toBe(false);
  expect(editor()).toMatchObject({ readonly: false, handle: pickedHandle });
  // Brunch's save state refuses only because the picked revision is unedited.
  expect(observed.brunch?.hostSave?.read(netAId).refusal).toBe(
    "There are no unsaved changes to save.",
  );
});
