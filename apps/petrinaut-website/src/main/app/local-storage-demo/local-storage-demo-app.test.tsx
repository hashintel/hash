/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  Children,
  isValidElement,
  use,
  useLayoutEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  brunchEvaluationConversationIdFrom,
  ordinaryConstructionConversationIdFrom,
} from "@hashintel/brunch-agent/client";
import {
  BrunchAssistantContext,
  brunchPlugin,
  InterviewBudgetControl,
} from "@hashintel/brunch-agent/ui";
import { toPetrinautId } from "@hashintel/petrinaut-core";
import {
  defaultPetrinautNavigationHistoryPolicy,
  useCommandRegistry,
  UserSettingsContext,
  UserSettingsProvider,
} from "@hashintel/petrinaut/react";

import { demoPlugins } from "../plugins/demo-plugins";
import { petrinautAiPlugin } from "../plugins/petrinaut-ai/plugin";
import {
  assistantSelectionStorageKey,
  defaultAssistantSelection,
  parseAssistantSelection,
  resolveDefaultAssistantSelection,
} from "./assistant-selection";
import { LocalStorageDemoApp } from "./local-storage-demo-app";
import { latestOrNewNetInStorage } from "./use-local-storage-sdcpns";
import { voicePreferenceStorageKey } from "./voice-preference";

import type {
  PetrinautAiMessage,
  PetrinautAiAssistant,
} from "@hashintel/brunch-agent/ui";
import type {
  CommandRegistryView,
  MinimalNetMetadata,
  PetrinautDocHandle,
} from "@hashintel/petrinaut-core";
import type {
  PetrinautNavigationController,
  UserSettingsContextValue,
} from "@hashintel/petrinaut/react";
import type { PetrinautPlugin } from "@hashintel/petrinaut/ui/plugin";

const netOneId = toPetrinautId("net-1");
const netTwoId = toPetrinautId("net-2");
const freshNetId = toPetrinautId("net-fresh");
const staleNetId = toPetrinautId("net-stale");

const flueClientMock = vi.hoisted(() => ({ current: null as unknown }));
const flueClientOptions = vi.hoisted(() => ({ current: null as unknown }));
const renderedPetrinaut = vi.hoisted(() => ({
  aiAssistant: null as unknown,
  commandRegistry: null as CommandRegistryView | null,
  settings: null as UserSettingsContextValue | null,
}));
const renderedAssistants = vi.hoisted(
  () => [] as (PetrinautAiAssistant | undefined)[],
);
vi.mock("@flue/sdk", () => ({
  createFlueClient: (options: unknown) => {
    flueClientOptions.current = options;
    return flueClientMock.current;
  },
}));

const brunchPreviewConfig = vi.hoisted(() => ({
  chatEndpoint: "/agents/petrinaut",
  isBrunchConfigured: true,
}));
vi.mock("./brunch-preview-config", () => ({
  resolveBrunchPreviewConfig: () => brunchPreviewConfig,
}));

const editorProps = vi.hoisted(() => ({
  current: null as {
    /** Brunch's assistant, which reaches the editor through its plugin's bridge. */
    bridgedAssistant?: PetrinautAiAssistant;
    createNewNet?: (params: {
      petriNetDefinition: unknown;
      title: string;
    }) => void;
    existingNets?: unknown;
    handle?: unknown;
    loadPetriNet?: unknown;
    navigation?: unknown;
    plugins?: readonly PetrinautPlugin[];
    slots?: { settingsLabs?: ReactNode };
    title?: string;
  } | null,
}));

vi.mock("./brunch-actor-key", () => ({
  getOrCreateBrunchActorKey: () => "test-actor",
}));
vi.mock("../plugins/petrinaut-ai/plugin", () => ({
  petrinautAiPlugin: {
    manifest: {
      id: "website.petrinaut-ai",
      name: "Petrinaut AI",
      assistant: true,
    },
  },
}));

/** Records what the stand-in editor rendered, for the tests to read. */
const recordEditorRender = (
  props: Record<string, unknown>,
  bridgedAssistant: PetrinautAiAssistant | undefined,
  commandRegistry: CommandRegistryView | null,
  settings: UserSettingsContextValue,
) => {
  editorProps.current = { ...props, bridgedAssistant };
  renderedPetrinaut.commandRegistry = commandRegistry;
  renderedPetrinaut.settings = settings;
  renderedPetrinaut.aiAssistant = bridgedAssistant;
  renderedAssistants.push(bridgedAssistant);
};

/**
 * Stands in for the editor's view. It shows the assistant the test chose in
 * the user settings, and mounts Brunch's content, which marks Brunch as shown,
 * only while that is Brunch. Which assistant the editor shows without a
 * choice is the editor's to test.
 */
const FakeEditorView = (props: Record<string, unknown>) => {
  "use no memo"; // Records every render, which memoization would skip.
  const settings = use(UserSettingsContext);
  const host = use(BrunchAssistantContext);
  const brunchShown = settings.assistantPluginId === "website.brunch";
  const documentId = (props.handle as { id: string }).id;
  const show = host?.show;
  useLayoutEffect(
    () => (brunchShown ? show?.(documentId) : undefined),
    [brunchShown, show, documentId],
  );

  // Brunch's content reads its assistant from the shell's bridge, never a
  // prop, and renders it only while mounted.
  const bridgedAssistant = brunchShown
    ? (host?.assistant ?? undefined)
    : undefined;
  // The real editor reuses the registry the host provides.
  recordEditorRender(props, bridgedAssistant, useCommandRegistry(), settings);
  return (
    (props.slots as { settingsLabs?: ReactNode } | undefined)?.settingsLabs ??
    null
  );
};

vi.mock("@hashintel/petrinaut/ui", async (importOriginal) => ({
  // Brunch's chat uses the editor's public UI exports; only the editor is mocked.
  ...(await importOriginal<typeof import("@hashintel/petrinaut/ui")>()),
  // The real editor owns the user settings while the host provides none.
  Petrinaut: (props: Record<string, unknown>) => (
    <UserSettingsProvider>
      <FakeEditorView {...props} />
    </UserSettingsProvider>
  ),
}));

/**
 * Node supplies its own `localStorage` global that shadows the jsdom one and
 * carries no `setItem`, so the demo's storage hooks cannot read a seed from
 * it. An in-memory store gives them one.
 */
const stubStorage = () => {
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => entries.delete(key),
    setItem: (key: string, value: string) => entries.set(key, value),
  } satisfies Storage);
};

/**
 * The `storage` event another tab's write raises. Built by hand because the
 * stubbed store is not a jsdom `Storage`, which `StorageEvent` insists on.
 */
const otherTabStorageEvent = (key: string): Event =>
  Object.defineProperties(new Event("storage"), {
    key: { value: key },
    storageArea: { value: localStorage },
  });

const storedNet = (params: {
  id: string;
  lastUpdated: string;
  revisionId?: string;
  title: string;
}) => ({
  id: params.id,
  title: params.title,
  lastUpdated: params.lastUpdated,
  ...(params.revisionId === undefined ? {} : { revisionId: params.revisionId }),
  sdcpn: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
});

const seedStoredNet = (revisionId?: string) => {
  stubStorage();
  localStorage.setItem(
    "petrinaut-sdcpn",
    JSON.stringify({
      [netOneId]: storedNet({
        id: netOneId,
        lastUpdated: "2020-01-01T00:00:00.000Z",
        revisionId,
        title: "Seeded net",
      }),
    }),
  );
};

/** A user who chose Brunch: saved for the demo and in the editor's settings. */
const seedBrunchChoice = () => {
  localStorage.setItem(assistantSelectionStorageKey, "brunch");
  localStorage.setItem(
    "petrinaut:user-settings",
    JSON.stringify({ assistantPluginId: "website.brunch" }),
  );
};

/**
 * The demo as `/local/$netId` mounts it: open on the most recently edited net,
 * and following its own requests to open another.
 */
const DemoApp = (
  props: Omit<
    ComponentProps<typeof LocalStorageDemoApp>,
    "netId" | "onOpenNet"
  >,
) => {
  const [netId, setNetId] = useState(
    () => latestOrNewNetInStorage(localStorage).id,
  );
  return <LocalStorageDemoApp {...props} netId={netId} onOpenNet={setNetId} />;
};

/**
 * `navigation` is an optional prop, so dropping it from the editor compiles
 * and leaves every other check green while the demo silently stops mirroring
 * its location to the URL. These render the real component to pin the wiring.
 */
describe("local storage demo URL navigation", () => {
  // Without this, a tree left mounted by an earlier case re-renders after the
  // next one and overwrites the captured props with its own controller.
  afterEach(() => {
    cleanup();
    editorProps.current = null;
    renderedAssistants.length = 0;
  });

  const mountedNavigation = (): PetrinautNavigationController => {
    const navigation = editorProps.current?.navigation;
    expect(navigation).toBeDefined();
    return navigation as PetrinautNavigationController;
  };

  test("resolves a URL-borne location into the controller it hands the editor", () => {
    seedStoredNet();

    render(
      <DemoApp
        onSearchChange={() => {}}
        search={{ subnet: "subnet-1", itemType: "place", itemId: "place-1" }}
      />,
    );

    const navigation = mountedNavigation();
    expect(navigation.state.subnetId).toBe("subnet-1");
    expect(navigation.state.selection).toEqual([
      { type: "place", id: "place-1" },
    ]);
  });

  test("writes an editor navigation back to the URL", () => {
    seedStoredNet();
    const onSearchChange = vi.fn();

    render(<DemoApp onSearchChange={onSearchChange} search={{}} />);

    mountedNavigation().onNavigate(
      (current) => ({ ...current, subnetId: "subnet-2" }),
      {
        history: "push",
        intent: { cause: "user", action: "subnet" },
      },
    );

    expect(onSearchChange).toHaveBeenCalledWith({ subnet: "subnet-2" }, "push");
  });

  test("leaves history to the library default, so a discrete click pushes", () => {
    seedStoredNet();

    render(<DemoApp onSearchChange={() => {}} search={{}} />);

    // Constraining this page's policy once made selections replace, which left
    // the page with no history entries at all and sent the first Back press
    // off the site. The default keeps drag churn to one entry by replacing
    // continuing intents, so it needs no host override.
    expect(mountedNavigation().historyPolicy).toBeUndefined();
    expect(
      defaultPetrinautNavigationHistoryPolicy({
        cause: "user",
        action: "selection",
        phase: "discrete",
      }),
    ).toBe("push");
    expect(
      defaultPetrinautNavigationHistoryPolicy({
        cause: "user",
        action: "selection",
        phase: "continue",
      }),
    ).toBe("replace");
  });

  test("opens a new net at its own URL", () => {
    seedStoredNet();
    const onOpenNet = vi.fn();
    const onSearchChange = vi.fn();

    render(
      <LocalStorageDemoApp
        netId={netOneId}
        onOpenNet={onOpenNet}
        onSearchChange={onSearchChange}
        search={{ subnet: "subnet-1", itemType: "place", itemId: "place-1" }}
      />,
    );

    act(() => {
      editorProps.current?.createNewNet?.({
        petriNetDefinition: {
          places: [],
          transitions: [],
          types: [],
          parameters: [],
          differentialEquations: [],
        },
        title: "Another net",
      });
    });

    // The route opens the new net with an empty search, so the old net's
    // location goes with its URL rather than through a search write.
    const [createdId] = onOpenNet.mock.lastCall as [string];
    expect(createdId).not.toBe(netOneId);
    expect(localStorage.getItem("petrinaut-sdcpn")).toContain(createdId);
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  test("stays on the open net and says why when the browser refuses a new one", () => {
    seedStoredNet();
    const onOpenNet = vi.fn();
    render(
      <LocalStorageDemoApp
        netId={netOneId}
        onOpenNet={onOpenNet}
        onSearchChange={() => {}}
        search={{}}
      />,
    );
    localStorage.setItem = () => {
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
    };

    act(() => {
      editorProps.current?.createNewNet?.({
        petriNetDefinition: {
          places: [],
          transitions: [],
          types: [],
          parameters: [],
          differentialEquations: [],
        },
        title: "Another net",
      });
    });

    expect(onOpenNet).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn't save the new net: browser storage is full or blocked",
    );
  });

  test("clears a refused new net's notice when another net opens", () => {
    stubStorage();
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        [netOneId]: storedNet({
          id: netOneId,
          lastUpdated: "2020-01-01T00:00:00.000Z",
          title: "Seeded net",
        }),
        [netTwoId]: storedNet({
          id: netTwoId,
          lastUpdated: "2020-01-02T00:00:00.000Z",
          title: "Other net",
        }),
      }),
    );
    const props = {
      onOpenNet: () => {},
      onSearchChange: () => {},
      search: {},
    };
    const { rerender } = render(
      <LocalStorageDemoApp netId={netOneId} {...props} />,
    );
    localStorage.setItem = () => {
      throw new DOMException(
        "The quota has been exceeded.",
        "QuotaExceededError",
      );
    };
    act(() => {
      editorProps.current?.createNewNet?.({
        petriNetDefinition: {
          places: [],
          transitions: [],
          types: [],
          parameters: [],
          differentialEquations: [],
        },
        title: "Another net",
      });
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn't save the new net",
    );

    // Back and Forward change `netId` on the same mounted shell.
    rerender(<LocalStorageDemoApp netId={netTwoId} {...props} />);

    expect(screen.queryByText(/Couldn't save the new net/)).toBeNull();
  });

  test("explains a net the browser does not hold", () => {
    seedStoredNet();

    render(
      <LocalStorageDemoApp
        netId={netTwoId}
        onOpenNet={() => {}}
        onSearchChange={() => {}}
        search={{}}
      />,
    );

    expect(screen.getByText("Local document not found")).toBeTruthy();
  });

  test("clears a multi-item selection the URL never carried", () => {
    seedStoredNet();
    const onSearchChange = vi.fn();

    render(<DemoApp onSearchChange={onSearchChange} search={{}} />);

    // A selection of more than one item projects to an empty search, so the
    // URL is already empty and writing `{}` to it changes no prop. Clearing
    // only through the URL therefore left this selection in place and carried
    // ids from the old net into the next one.
    act(() => {
      mountedNavigation().onNavigate(
        (current) => ({
          ...current,
          selection: [
            { type: "place", id: "place-1" },
            { type: "place", id: "place-2" },
          ],
        }),
        { history: "push", intent: { cause: "user", action: "selection" } },
      );
    });
    expect(mountedNavigation().state.selection).toHaveLength(2);

    act(() => {
      editorProps.current?.createNewNet?.({
        petriNetDefinition: {
          places: [],
          transitions: [],
          types: [],
          parameters: [],
          differentialEquations: [],
        },
        title: "Another net",
      });
    });

    expect(mountedNavigation().state.selection).toEqual([]);
  });
});

describe("local document revision persistence", () => {
  afterEach(() => {
    cleanup();
    editorProps.current = null;
  });

  test("retains direct document changes across handle reopen", async () => {
    flueClientOptions.current = null;
    seedStoredNet("local-revision-1");
    seedBrunchChoice();
    const firstView = render(<DemoApp onSearchChange={() => {}} search={{}} />);
    const firstHandle = editorProps.current?.handle as PetrinautDocHandle;

    act(() => {
      firstHandle.change((draft) => {
        draft.places.push({
          id: toPetrinautId("direct-place"),
          name: "Direct place",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      });
    });
    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<
        string,
        { revisionId?: string; sdcpn: { places: { id: string }[] } }
      >;
      expect(stored[netOneId]?.revisionId).toBeTypeOf("string");
      expect(stored[netOneId]?.revisionId).not.toBe("local-revision-1");
      expect(stored[netOneId]?.sdcpn.places.map((place) => place.id)).toEqual([
        toPetrinautId("direct-place"),
      ]);
    });

    firstView.unmount();
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    const reopenedHandle = editorProps.current?.handle as PetrinautDocHandle;
    expect(reopenedHandle).not.toBe(firstHandle);
    expect(reopenedHandle.doc()?.places.map((place) => place.id)).toEqual([
      toPetrinautId("direct-place"),
    ]);

    // The reopened handle chains from the record revision it opened at.
    act(() => {
      reopenedHandle.change((draft) => {
        draft.places.push({
          id: toPetrinautId("reopened-place"),
          name: "Reopened place",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      });
    });
    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<string, { sdcpn: { places: { id: string }[] } }>;
      expect(stored[netOneId]?.sdcpn.places.map((place) => place.id)).toEqual([
        toPetrinautId("direct-place"),
        toPetrinautId("reopened-place"),
      ]);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("lists each stored net with the time it was last written", async () => {
    seedStoredNet("local-revision-1");
    render(<DemoApp onSearchChange={() => {}} search={{}} />);

    expect(editorProps.current?.existingNets).toEqual([
      {
        netId: netOneId,
        title: "Seeded net",
        lastUpdated: "2020-01-01T00:00:00.000Z",
      },
    ]);

    const handle = editorProps.current?.handle as PetrinautDocHandle;
    act(() => {
      handle.change((draft) => {
        draft.places.push({
          id: "listed-place",
          name: "Listed place",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      });
    });

    await waitFor(() => {
      const nets = editorProps.current?.existingNets as MinimalNetMetadata[];
      expect(new Date(nets[0]?.lastUpdated ?? 0).getTime()).toBeGreaterThan(
        new Date("2020-01-01T00:00:00.000Z").getTime(),
      );
    });
  });

  test("lists stored nets with the most recently updated first", () => {
    stubStorage();
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        [staleNetId]: storedNet({
          id: staleNetId,
          lastUpdated: "2020-01-01T00:00:00.000Z",
          revisionId: "stale-revision",
          title: "Stale net",
        }),
        [freshNetId]: storedNet({
          id: freshNetId,
          lastUpdated: "2024-06-01T00:00:00.000Z",
          revisionId: "fresh-revision",
          title: "Fresh net",
        }),
      }),
    );
    render(<DemoApp onSearchChange={() => {}} search={{}} />);

    const nets = editorProps.current?.existingNets as MinimalNetMetadata[];
    expect(nets.map(({ netId }) => netId)).toEqual([freshNetId, staleNetId]);
  });

  test("adopts another tab's revision of the open document and chains later changes from it", async () => {
    seedStoredNet("local-revision-1");
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    const firstHandle = editorProps.current?.handle as PetrinautDocHandle;

    const otherTabPlace = {
      id: toPetrinautId("other-tab-place"),
      name: "Other tab place",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    };
    const stored = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, { sdcpn: { places: unknown[] } }>;
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        ...stored,
        [netOneId]: {
          ...stored[netOneId],
          revisionId: "other-tab-revision",
          lastUpdated: "2026-01-01T00:00:00.000Z",
          sdcpn: { ...stored[netOneId]?.sdcpn, places: [otherTabPlace] },
        },
      }),
    );
    act(() => {
      window.dispatchEvent(otherTabStorageEvent("petrinaut-sdcpn"));
    });

    await waitFor(() =>
      expect(editorProps.current?.handle).not.toBe(firstHandle),
    );
    const adoptedHandle = editorProps.current?.handle as PetrinautDocHandle;
    expect(adoptedHandle.doc()?.places.map((place) => place.id)).toEqual([
      toPetrinautId("other-tab-place"),
    ]);

    act(() => {
      adoptedHandle.change((draft) => {
        draft.places.push({
          ...otherTabPlace,
          id: toPetrinautId("this-tab-place"),
        });
      });
    });
    await waitFor(() => {
      const persisted = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<
        string,
        { revisionId?: string; sdcpn: { places: { id: string }[] } }
      >;
      expect(persisted[netOneId]?.revisionId).toBeTypeOf("string");
      expect(persisted[netOneId]?.revisionId).not.toBe("other-tab-revision");
      expect(
        persisted[netOneId]?.sdcpn.places.map((place) => place.id),
      ).toEqual([
        toPetrinautId("other-tab-place"),
        toPetrinautId("this-tab-place"),
      ]);
    });
    expect(editorProps.current?.handle).toBe(adoptedHandle);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("reports a refused change and reopens the editor from the repository's record so the next change is accepted", async () => {
    seedStoredNet("local-revision-1");
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    const refusedHandle = editorProps.current?.handle as PetrinautDocHandle;
    const addPlace = (handle: PetrinautDocHandle, id: string) =>
      act(() => {
        handle.change((draft) => {
          draft.places.push({
            id,
            name: id,
            colorId: null,
            dynamicsEnabled: false,
            x: 0,
            y: 0,
          });
        });
      });

    // Another tab moves net-1 on; its storage event has not reached this tab,
    // so the open handle's next change names a predecessor the store no
    // longer holds. A handle kept after the refusal would name its refused
    // revision as the predecessor and be refused again.
    const stored = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, Record<string, unknown>>;
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        ...stored,
        [netOneId]: { ...stored[netOneId], revisionId: "other-tab-revision" },
      }),
    );

    addPlace(refusedHandle, "refused-place");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("not saved");
    expect(alert.textContent).toContain(
      "revision does not follow its predecessor",
    );
    // The refused change is dropped: the editor reopens from the record.
    await waitFor(() =>
      expect(editorProps.current?.handle).not.toBe(refusedHandle),
    );
    const reopenedHandle = editorProps.current?.handle as PetrinautDocHandle;
    expect(reopenedHandle.doc()?.places).toEqual([]);
    // The notice outlives the handle it was raised for.
    expect(screen.getByRole("alert").textContent).toContain(
      "revision does not follow its predecessor",
    );

    addPlace(reopenedHandle, "accepted-place");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(editorProps.current?.handle).toBe(reopenedHandle);
    const persisted = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<
      string,
      { revisionId?: string; sdcpn: { places: { id: string }[] } }
    >;
    expect(persisted[netOneId]?.revisionId).toBeTypeOf("string");
    expect(persisted[netOneId]?.revisionId).not.toBe("other-tab-revision");
    expect(persisted[netOneId]?.sdcpn.places.map((place) => place.id)).toEqual([
      "accepted-place",
    ]);
  });

  test("forgets a refused change once another document is opened", async () => {
    seedStoredNet("local-revision-1");
    const stored = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, Record<string, unknown>>;
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        ...stored,
        [netTwoId]: {
          ...stored[netOneId],
          id: netTwoId,
          title: "Second net",
          revisionId: "second-revision",
          lastUpdated: "2019-01-01T00:00:00.000Z",
        },
      }),
    );
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    const handle = editorProps.current?.handle as PetrinautDocHandle;

    // Another tab moves net-1 on; its storage event has not reached this tab.
    const otherTabPlace = {
      id: toPetrinautId("other-tab-place"),
      name: "Other tab place",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    };
    const current = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, { sdcpn: Record<string, unknown> }>;
    localStorage.setItem(
      "petrinaut-sdcpn",
      JSON.stringify({
        ...current,
        [netOneId]: {
          ...current[netOneId],
          revisionId: "other-tab-revision",
          sdcpn: { ...current[netOneId]?.sdcpn, places: [otherTabPlace] },
        },
      }),
    );
    act(() => {
      handle.change((draft) => {
        draft.places.push({
          id: "refused-place",
          name: "Refused place",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      });
    });
    await screen.findByRole("alert");

    // Read on each call: the editor hands over a fresh callback per render.
    const loadPetriNet = (petriNetId: string) =>
      (
        editorProps.current?.loadPetriNet as
          | ((petriNetId: string) => void)
          | undefined
      )?.(petriNetId);
    act(() => loadPetriNet(netTwoId));
    await waitFor(() => expect(editorProps.current?.title).toBe("Second net"));
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => loadPetriNet(netOneId));
    await waitFor(() => expect(editorProps.current?.title).toBe("Seeded net"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("keeps Brunch bound to the editor's active handle across saves and document switches", async () => {
    seedStoredNet("first-revision");
    const stored = JSON.parse(
      localStorage.getItem("petrinaut-sdcpn") ?? "{}",
    ) as Record<string, unknown>;
    stored[netTwoId] = storedNet({
      id: netTwoId,
      lastUpdated: "2019-01-01T00:00:00.000Z",
      title: "Second net",
    });
    localStorage.setItem("petrinaut-sdcpn", JSON.stringify(stored));
    seedBrunchChoice();
    flueClientMock.current = {
      observe: () => ({
        close: vi.fn(),
        getSnapshot: () => ({ phase: "absent" }),
        refresh: vi.fn(),
        subscribe: () => () => undefined,
      }),
    };
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() =>
      expect(editorProps.current?.bridgedAssistant?.documentHandle).toBe(
        editorProps.current?.handle,
      ),
    );
    const handle = editorProps.current?.handle as PetrinautDocHandle;
    act(() => {
      handle.change((draft) => {
        draft.places.push({
          id: "first-place",
          name: "First place",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        });
      });
    });
    await waitFor(() => {
      const persisted = JSON.parse(
        localStorage.getItem("petrinaut-sdcpn") ?? "{}",
      ) as Record<
        string,
        { revisionId?: string; sdcpn: { places: { id: string }[] } }
      >;
      expect(persisted[netOneId]?.revisionId).not.toBe("first-revision");
      expect(
        persisted[netOneId]?.sdcpn.places.map((place) => place.id),
      ).toEqual(["first-place"]);
    });
    expect(editorProps.current?.bridgedAssistant?.documentHandle).toBe(handle);

    const loadPetriNet = editorProps.current?.loadPetriNet as (
      petriNetId: string,
    ) => void;
    act(() => loadPetriNet(netTwoId));

    await waitFor(() => expect(editorProps.current?.title).toBe("Second net"));
    expect(editorProps.current?.handle).not.toBe(handle);
    expect(editorProps.current?.bridgedAssistant?.documentHandle).toBe(
      editorProps.current?.handle,
    );
  });
});

describe("local storage demo Brunch controls", () => {
  afterEach(() => {
    cleanup();
    editorProps.current = null;
    brunchPreviewConfig.isBrunchConfigured = true;
  });

  test("clearing ordinary Brunch starts a persisted fresh conversation without replacing the model", async () => {
    seedStoredNet();
    seedBrunchChoice();
    flueClientMock.current = {
      history: async () => ({
        conversation: { settlements: [], messages: [] },
        offset: "0",
      }),
      observe: () => ({
        close: vi.fn(),
        getSnapshot: () => ({ phase: "absent" }),
        refresh: vi.fn(),
        subscribe: () => () => {},
      }),
    };
    const view = render(<DemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() =>
      expect(editorProps.current?.bridgedAssistant).toBeDefined(),
    );
    const first = editorProps.current?.bridgedAssistant as PetrinautAiAssistant;
    const originalId = first.conversationId;
    const handle = editorProps.current?.handle;
    expect(first.canClearMessages).toBe(true);
    act(() => first.onClearMessages?.());
    const next = editorProps.current?.bridgedAssistant as PetrinautAiAssistant;
    expect(next.conversationId).not.toBe(originalId);
    expect(next.conversationId).toContain(
      `${ordinaryConstructionConversationIdFrom(netOneId)}:`,
    );
    expect(next.automaticTools).not.toBe(first.automaticTools);
    expect(editorProps.current?.handle).toBe(handle);
    const nextId = next.conversationId;
    view.unmount();
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() =>
      expect(editorProps.current?.bridgedAssistant?.conversationId).toBe(
        nextId,
      ),
    );
  });

  test("bridges document-bound Brunch through context with the editor's handle", async () => {
    seedStoredNet();
    seedBrunchChoice();
    flueClientMock.current = {
      history: async () => ({
        conversation: {
          conversationId: ordinaryConstructionConversationIdFrom(netOneId),
          settlements: [],
          messages: [],
        },
        offset: "offset-0",
      }),
      observe: () => ({
        close: vi.fn(),
        getSnapshot: () => ({ phase: "absent" }),
        refresh: vi.fn(),
        subscribe: () => () => undefined,
      }),
    };

    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() =>
      expect(editorProps.current?.bridgedAssistant).toBeDefined(),
    );
    const aiAssistant = editorProps.current
      ?.bridgedAssistant as PetrinautAiAssistant;
    expect(aiAssistant.conversationId).toBe(
      brunchEvaluationConversationIdFrom(
        ordinaryConstructionConversationIdFrom(netOneId),
      ),
    );
    // Brunch reaches the editor through context, not its built-in assistant prop.
    expect(editorProps.current).not.toHaveProperty("aiAssistant");
    expect(aiAssistant.documentHandle).toBe(editorProps.current?.handle);
    // The website still names its actor under the header's former name, so
    // it keeps working against a Brunch that predates the actor header.
    const { headers } = flueClientOptions.current as {
      headers: () => Record<string, string>;
    };
    expect(headers()).toEqual({
      "x-brunch-principal": "test-actor",
      "x-brunch-conversation": aiAssistant.conversationId,
    });
  });
});

describe("assistant selection", () => {
  test("uses Stock by default, accepts a Brunch launch default, and preserves explicit choices", () => {
    expect(resolveDefaultAssistantSelection(undefined)).toBe("stock");
    expect(resolveDefaultAssistantSelection("")).toBe("stock");
    expect(resolveDefaultAssistantSelection("stock")).toBe("stock");
    expect(resolveDefaultAssistantSelection("brunch")).toBe("brunch");
    expect(() => resolveDefaultAssistantSelection("other")).toThrow(
      /VITE_PETRINAUT_DEFAULT_ASSISTANT/u,
    );
    expect(defaultAssistantSelection).toBe("stock");
    expect(parseAssistantSelection(null)).toBe("stock");
    expect(parseAssistantSelection("unknown")).toBe("stock");
    expect(parseAssistantSelection("stock")).toBe("stock");
    expect(parseAssistantSelection("brunch")).toBe("brunch");
  });

  const flueHistoryClient = () => ({
    history: async () => ({
      conversation: {
        conversationId: ordinaryConstructionConversationIdFrom(netOneId),
        settlements: [],
        messages: [],
      },
      offset: "offset-0",
    }),
    observe: () => ({
      close: vi.fn(),
      getSnapshot: () => ({ phase: "absent" }),
      refresh: vi.fn(),
      subscribe: () => () => undefined,
    }),
  });
  /** Chooses an assistant as Petrinaut's settings and palette do. */
  const chooseAssistant = (pluginId: string) =>
    act(() => renderedPetrinaut.settings?.setAssistantPluginId(pluginId));
  const currentAssistant = () => editorProps.current?.bridgedAssistant;
  const currentVoiceCapability = () => {
    const settingsLabs = editorProps.current?.slots?.settingsLabs;
    if (!isValidElement<{ openAIVoiceConfig: unknown }>(settingsLabs)) {
      throw new Error("Expected the website Labs settings to render.");
    }
    return settingsLabs.props.openAIVoiceConfig;
  };
  const currentVoiceProvider = () => {
    const control = currentAssistant()?.renderVoiceMode?.({
      canAcceptVoiceInput: true,
      conversationId: "labs-test",
      inputMode: "text",
      isAiAssistantOpen: true,
      messages: [],
      registerVoiceModeControls: vi.fn(() => () => {}),
      reportVoiceSessionState: vi.fn(),
      setInputMode: vi.fn(),
      setVoiceActive: vi.fn(),
      status: "ready",
      stop: vi.fn(async () => {}),
      submitText: vi.fn(),
      submitVoiceInput: vi.fn(),
    });
    if (!isValidElement<{ config: { provider?: string } }>(control)) {
      throw new Error("Expected a configured Voice control.");
    }
    return control.props.config.provider;
  };

  afterEach(() => {
    cleanup();
    editorProps.current = null;
    brunchPreviewConfig.isBrunchConfigured = true;
    vi.unstubAllGlobals();
  });

  test("ordinary Stock is the default and never mounts Flue history", () => {
    seedStoredNet("stock-revision");
    const observe = vi.fn();
    const history = vi.fn();
    flueClientMock.current = { history, observe };
    flueClientOptions.current = null;

    render(<DemoApp onSearchChange={() => {}} search={{}} />);

    expect(currentAssistant()).toBeUndefined();
    expect(editorProps.current?.plugins).toContain(petrinautAiPlugin);
    expect(flueClientOptions.current).toBeNull();
    expect(history).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(editorProps.current?.slots?.settingsLabs).toBeDefined();
    expect(
      screen.getByRole("checkbox", { name: "Enable Voice" }),
    ).toHaveProperty("checked", false);
    expect(screen.queryByText(/evaluation mode/iu)).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  test("choosing Brunch keeps the Voice choice and persists the opt-in Realtime choice", async () => {
    seedStoredNet();
    localStorage.setItem(voicePreferenceStorageKey, "false");
    flueClientMock.current = flueHistoryClient();
    vi.stubGlobal("PointerEvent", MouseEvent);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({
          available: true,
          connectionTimeoutMs: 10_000,
          provider: "realtime",
        }),
      ),
    );

    const firstView = render(<DemoApp onSearchChange={() => {}} search={{}} />);
    const firstVoiceToggle = await screen.findByRole("checkbox", {
      name: "Enable Voice",
    });
    expect(firstVoiceToggle).toHaveProperty("disabled", true);
    expect(firstVoiceToggle).toHaveProperty("checked", false);
    expect(
      screen.queryByRole("checkbox", { name: "Realtime mode" }),
    ).toBeNull();

    chooseAssistant("website.brunch");
    await waitFor(() =>
      expect(firstVoiceToggle).toHaveProperty("disabled", false),
    );
    expect(firstVoiceToggle).toHaveProperty("checked", false);
    fireEvent.click(firstVoiceToggle);
    await waitFor(() => {
      expect(firstVoiceToggle).toHaveProperty("checked", true);
      expect(localStorage.getItem(voicePreferenceStorageKey)).toBe("true");
    });
    const realtimeToggle = screen.getByRole("checkbox", {
      name: "Realtime mode",
    });
    expect(realtimeToggle).toHaveProperty("checked", false);
    expect(currentVoiceProvider()).toBe("live");
    fireEvent.click(realtimeToggle);
    expect(realtimeToggle).toHaveProperty("checked", true);
    await waitFor(() => expect(currentVoiceProvider()).toBe("realtime"));

    firstView.unmount();
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    const restoredVoiceToggle = await screen.findByRole("checkbox", {
      name: "Enable Voice",
    });
    await waitFor(() => {
      expect(restoredVoiceToggle).toHaveProperty("checked", true);
      expect(restoredVoiceToggle).toHaveProperty("disabled", false);
      expect(
        screen.getByRole("checkbox", { name: "Realtime mode" }),
      ).toHaveProperty("checked", true);
      expect(currentVoiceProvider()).toBe("realtime");
    });
    fireEvent.click(restoredVoiceToggle);
    await waitFor(() =>
      expect(localStorage.getItem(voicePreferenceStorageKey)).toBe("false"),
    );
    expect(currentAssistant()?.renderVoiceMode).toBeUndefined();
    expect(
      screen.queryByRole("checkbox", { name: "Realtime mode" }),
    ).toBeNull();
    fireEvent.click(restoredVoiceToggle);
    fireEvent.click(
      await screen.findByRole("checkbox", { name: "Realtime mode" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Realtime mode" }),
    ).toHaveProperty("checked", false);
    await waitFor(() => expect(currentVoiceProvider()).toBe("live"));
  });

  test.each([
    [undefined, "standard"],
    ["thorough", "thorough"],
    ["off", "off"],
  ] as const)(
    "gates interview length separately from saved level %s",
    async (savedLevel, expectedLevel) => {
      seedStoredNet();
      seedBrunchChoice();
      if (savedLevel)
        localStorage.setItem("petrinaut-website:interview-budget", savedLevel);
      flueClientMock.current = flueHistoryClient();
      vi.stubGlobal("PointerEvent", MouseEvent);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            available: true,
            provider: "live",
            connectionTimeoutMs: 10_000,
          }),
        ),
      );
      const context = {
        conversationId: "labs-test",
        messages: [],
        status: "ready" as const,
        stop: vi.fn(async () => {}),
        submitText: vi.fn(),
      };
      const expectBudget = (enabled: boolean) => {
        const level = enabled ? expectedLevel : "off";
        const assistant = currentAssistant();
        if (assistant === undefined)
          throw new Error("Brunch's assistant is not bridged to the editor");
        const composer = assistant.renderComposerControl?.(context);
        if (!isValidElement<{ children: ReactNode }>(composer))
          throw new Error("Missing composer controls");
        expect(
          Children.toArray(composer.props.children).some(
            (child) =>
              isValidElement(child) && child.type === InterviewBudgetControl,
          ),
        ).toBe(enabled);
        expect(Boolean(assistant.renderComposerStatus?.(context))).toBe(
          enabled,
        );
        const voice = assistant.renderVoiceMode?.({
          ...context,
          inputMode: "voice",
          isAiAssistantOpen: true,
          canAcceptVoiceInput: true,
          registerVoiceModeControls: vi.fn(() => () => {}),
          reportVoiceSessionState: vi.fn(),
          setInputMode: vi.fn(),
          setVoiceActive: vi.fn(),
          submitVoiceInput: vi.fn(),
        });
        if (
          !isValidElement<{
            interviewBudgetLevel: string;
            onInputModeChange?: (mode: "text" | "voice") => void;
          }>(voice)
        )
          throw new Error("Missing Voice control");
        expect(voice.props.interviewBudgetLevel).toBe(level);
      };
      const firstView = render(
        <DemoApp onSearchChange={() => {}} search={{}} />,
      );
      const toggle = await screen.findByRole("checkbox", {
        name: "Interview length",
      });
      await waitFor(() =>
        expect(currentAssistant()?.renderVoiceMode).toBeDefined(),
      );
      expect(toggle).toHaveProperty("checked", false);
      expectBudget(false);
      fireEvent.click(toggle);
      await waitFor(() => expectBudget(true));
      expect(
        localStorage.getItem("petrinaut-website:interview-budget-enabled"),
      ).toBe("true");
      firstView.unmount();
      const restoredView = render(
        <DemoApp onSearchChange={() => {}} search={{}} />,
      );
      await waitFor(() => expectBudget(true));
      const restoredToggle = screen.getByRole("checkbox", {
        name: "Interview length",
      });
      expect(restoredToggle).toHaveProperty("checked", true);
      fireEvent.click(restoredToggle);
      await waitFor(() => expectBudget(false));
      expect(
        localStorage.getItem("petrinaut-website:interview-budget-enabled"),
      ).toBe("false");
      expect(localStorage.getItem("petrinaut-website:interview-budget")).toBe(
        savedLevel ?? null,
      );
      restoredView.unmount();
      render(<DemoApp onSearchChange={() => {}} search={{}} />);
      await waitFor(() => expectBudget(false));
    },
  );

  test("a saved Brunch choice shows Brunch, and choosing Stock mounts nothing of Brunch", async () => {
    seedStoredNet();
    seedBrunchChoice();
    flueClientMock.current = flueHistoryClient();
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentAssistant()?.requestStop).toBeDefined());
    expect(currentAssistant()?.executeMutation).toBeUndefined();
    expect(localStorage.getItem(assistantSelectionStorageKey)).toBe("brunch");

    chooseAssistant("website.petrinaut-ai");

    await waitFor(() => expect(currentAssistant()).toBeUndefined());
    expect(editorProps.current?.plugins).toContain(petrinautAiPlugin);
    expect(editorProps.current?.plugins).toContain(brunchPlugin);
    expect(
      JSON.parse(localStorage.getItem("petrinaut:user-settings") ?? "{}"),
    ).toMatchObject({ assistantPluginId: "website.petrinaut-ai" });
  });

  test("defaults Voice on for saved Brunch, preserves an explicit opt-out, and removes it for Stock", async () => {
    seedStoredNet();
    seedBrunchChoice();
    flueClientMock.current = flueHistoryClient();
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ available: true, connectionTimeoutMs: 10_000 }),
    );
    vi.stubGlobal("fetch", fetch);
    const defaultView = render(
      <DemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledOnce();
      expect(currentVoiceCapability()).toEqual({
        available: true,
        connectionTimeoutMs: 10_000,
      });
    });
    expect(currentAssistant()?.renderVoiceMode).toBeDefined();

    defaultView.unmount();
    localStorage.setItem(voicePreferenceStorageKey, "false");
    const disabledView = render(
      <DemoApp onSearchChange={() => {}} search={{}} />,
    );
    await waitFor(() => expect(currentVoiceCapability()).toBeDefined());
    expect(currentAssistant()?.renderVoiceMode).toBeUndefined();
    disabledView.unmount();
    localStorage.setItem(voicePreferenceStorageKey, "true");
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() =>
      expect(currentAssistant()?.renderVoiceMode).toBeDefined(),
    );
    renderedAssistants.length = 0;

    chooseAssistant("website.petrinaut-ai");

    expect(renderedAssistants.length).toBeGreaterThan(0);
    expect(
      renderedAssistants.every(
        (assistant) => assistant?.renderVoiceMode === undefined,
      ),
    ).toBe(true);
    expect(localStorage.getItem(voicePreferenceStorageKey)).toBe("true");
  });

  test("does not render Voice when the persisted preference is on but capability is unavailable", async () => {
    seedStoredNet();
    seedBrunchChoice();
    localStorage.setItem(voicePreferenceStorageKey, "true");
    flueClientMock.current = flueHistoryClient();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ available: false }),
      ),
    );

    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    await waitFor(() => expect(currentVoiceCapability()).toBeNull());
    expect(currentAssistant()?.renderVoiceMode).toBeUndefined();
    expect(
      screen.getByRole("checkbox", { name: "Enable Voice" }),
    ).toHaveProperty("disabled", true);
    expect(localStorage.getItem(voicePreferenceStorageKey)).toBe("true");
  });

  test("clears cached Voice capability during each Stock to Brunch check", async () => {
    seedStoredNet();
    localStorage.setItem(assistantSelectionStorageKey, "stock");
    localStorage.setItem(voicePreferenceStorageKey, "true");
    flueClientMock.current = flueHistoryClient();
    const firstCapability = Promise.withResolvers<Response>();
    const secondCapability = Promise.withResolvers<Response>();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(firstCapability.promise)
      .mockReturnValueOnce(secondCapability.promise);
    vi.stubGlobal("fetch", fetch);
    render(<DemoApp onSearchChange={() => {}} search={{}} />);

    expect(currentAssistant()?.renderVoiceMode).toBeUndefined();
    renderedAssistants.length = 0;
    chooseAssistant("website.brunch");
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(currentVoiceCapability()).toBeUndefined();
    expect(currentAssistant()?.renderVoiceMode).toBeUndefined();
    expect(renderedAssistants.length).toBeGreaterThan(0);
    expect(
      renderedAssistants.every(
        (assistant) => assistant?.renderVoiceMode === undefined,
      ),
    ).toBe(true);

    firstCapability.resolve(
      Response.json({ available: true, connectionTimeoutMs: 10_000 }),
    );
    await waitFor(() =>
      expect(currentAssistant()?.renderVoiceMode).toBeDefined(),
    );

    chooseAssistant("website.petrinaut-ai");
    await waitFor(() =>
      expect(currentAssistant()?.renderVoiceMode).toBeUndefined(),
    );
    renderedAssistants.length = 0;
    chooseAssistant("website.brunch");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(currentVoiceCapability()).toBeUndefined();
    expect(currentAssistant()?.renderVoiceMode).toBeUndefined();
    expect(renderedAssistants.length).toBeGreaterThan(0);
    expect(
      renderedAssistants.every(
        (assistant) => assistant?.renderVoiceMode === undefined,
      ),
    ).toBe(true);

    secondCapability.resolve(
      Response.json({ available: true, connectionTimeoutMs: 10_000 }),
    );
    await waitFor(() =>
      expect(currentAssistant()?.renderVoiceMode).toBeDefined(),
    );
  });

  test("each assistant keeps its own history: stock messages stay in the local store and are never handed to Brunch", async () => {
    seedStoredNet();
    localStorage.setItem(assistantSelectionStorageKey, "stock");
    const stockMessage = {
      id: "stock-1",
      role: "user",
      parts: [{ type: "text", text: "Stock assistant turn" }],
    } as PetrinautAiMessage;
    // Petrinaut AI keeps its transcript here, under the net's id.
    localStorage.setItem(
      "petrinaut-ai-messages",
      JSON.stringify({ [netOneId]: [stockMessage] }),
    );
    flueClientMock.current = flueHistoryClient();
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    expect(currentAssistant()).toBeUndefined();

    chooseAssistant("website.brunch");
    await waitFor(() => expect(currentAssistant()?.requestStop).toBeDefined());
    const brunch = currentAssistant();
    expect(brunch?.executeMutation).toBeUndefined();
    expect(brunch?.messages ?? []).not.toContainEqual(stockMessage);
    act(() =>
      brunch?.onMessages?.([
        { id: "brunch-1", role: "user", parts: [] } as PetrinautAiMessage,
      ]),
    );
    expect(
      JSON.parse(localStorage.getItem("petrinaut-ai-messages") ?? "{}"),
    ).toEqual({
      [netOneId]: [stockMessage],
    });

    chooseAssistant("website.petrinaut-ai");
    await waitFor(() => expect(currentAssistant()).toBeUndefined());
    expect(editorProps.current?.plugins).toContain(petrinautAiPlugin);
  });

  test("gives the editor the demo's plugins and both assistants, Stock first by default", () => {
    seedStoredNet();
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    expect(editorProps.current?.plugins).toEqual([
      ...demoPlugins,
      petrinautAiPlugin,
      brunchPlugin,
    ]);
    expect(renderedPetrinaut.commandRegistry?.list()).toEqual([]);
  });

  test("lists a saved Brunch first, and connects it only while the editor shows it", async () => {
    seedStoredNet();
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
    flueClientMock.current = flueHistoryClient();
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    expect(editorProps.current?.plugins).toEqual([
      ...demoPlugins,
      brunchPlugin,
      petrinautAiPlugin,
    ]);

    chooseAssistant("website.brunch");
    await waitFor(() => expect(currentAssistant()).toBeDefined());

    chooseAssistant("website.petrinaut-ai");
    await waitFor(() => expect(currentAssistant()).toBeUndefined());
  });

  test("without a configured Brunch endpoint there is no choice to make", () => {
    brunchPreviewConfig.isBrunchConfigured = false;
    seedStoredNet();
    localStorage.setItem(assistantSelectionStorageKey, "brunch");
    render(<DemoApp onSearchChange={() => {}} search={{}} />);
    expect(currentAssistant()).toBeUndefined();
    expect(editorProps.current?.plugins).toEqual([
      ...demoPlugins,
      petrinautAiPlugin,
    ]);
    expect(editorProps.current?.slots?.settingsLabs).toBeUndefined();
    expect(
      renderedPetrinaut.commandRegistry?.list().map(({ id }) => id),
    ).toEqual([]);
  });
});
