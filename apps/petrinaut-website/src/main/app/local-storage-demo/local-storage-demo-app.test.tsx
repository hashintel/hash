/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";
import { defaultPetrinautNavigationHistoryPolicy } from "@hashintel/petrinaut/react";

import { stubLocalStorage } from "../plugins/_shared/testing/stub-local-storage";
import { demoPlugins } from "../plugins/demo-plugins";
import { LocalStorageDemoApp } from "./local-storage-demo-app";

import type {
  MinimalNetMetadata,
  PetrinautDocHandle,
} from "@hashintel/petrinaut-core";
import type { PetrinautNavigationController } from "@hashintel/petrinaut/react";
import type { PetrinautProps } from "@hashintel/petrinaut/ui";

const netOneId = toPetrinautId("net-1");
const netTwoId = toPetrinautId("net-2");
const freshNetId = toPetrinautId("net-fresh");
const staleNetId = toPetrinautId("net-stale");

const editorProps = vi.hoisted(() => ({
  current: null as PetrinautProps | null,
}));

// The editor and the plugins are the subjects of their own tests; here they
// stand still so the shell's wiring is what the tests see.
vi.mock("@hashintel/petrinaut/ui", () => ({
  Petrinaut: (props: PetrinautProps) => {
    editorProps.current = props;
    return null;
  },
}));
vi.mock("../plugins/demo-plugins", () => ({
  demoPlugins: [{ manifest: { id: "test.plugin", name: "Test" } }],
}));

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
  stubLocalStorage();
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
  });

  const mountedNavigation = (): PetrinautNavigationController => {
    const navigation = editorProps.current?.navigation;
    expect(navigation).toBeDefined();
    return navigation as PetrinautNavigationController;
  };

  test("resolves a URL-borne location into the controller it hands the editor", () => {
    seedStoredNet();

    render(
      <LocalStorageDemoApp
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

    render(<LocalStorageDemoApp onSearchChange={onSearchChange} search={{}} />);

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

    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);

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

  test("clears the shared location when a new net replaces the open one", () => {
    seedStoredNet();
    const onSearchChange = vi.fn();

    render(
      <LocalStorageDemoApp
        onSearchChange={onSearchChange}
        search={{ subnet: "subnet-1", itemType: "place", itemId: "place-1" }}
      />,
    );

    // A location names a place inside the net that was open, so carrying it
    // into the next net would select something that is not there. Petrinaut's
    // own per-document reset does not cover a controlled location.
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

    expect(onSearchChange).toHaveBeenCalledWith({}, "replace");
  });

  test("clears a multi-item selection the URL never carried", () => {
    seedStoredNet();
    const onSearchChange = vi.fn();

    render(<LocalStorageDemoApp onSearchChange={onSearchChange} search={{}} />);

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
    seedStoredNet("local-revision-1");
    const firstView = render(
      <LocalStorageDemoApp onSearchChange={() => {}} search={{}} />,
    );
    const firstHandle = editorProps.current?.handle as PetrinautDocHandle;

    act(() => {
      firstHandle.change((draft) => {
        draft.places.push({
          id: toPetrinautId("direct-place"),
          name: "Direct place",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
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
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
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
          differentialEquationId: null,
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
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);

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
          differentialEquationId: null,
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
    stubLocalStorage();
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
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);

    const nets = editorProps.current?.existingNets as MinimalNetMetadata[];
    expect(nets.map(({ netId }) => netId)).toEqual([freshNetId, staleNetId]);
  });

  test("adopts another tab's revision of the open document and chains later changes from it", async () => {
    seedStoredNet("local-revision-1");
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    const firstHandle = editorProps.current?.handle as PetrinautDocHandle;

    const otherTabPlace = {
      id: toPetrinautId("other-tab-place"),
      name: "Other tab place",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
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
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    const refusedHandle = editorProps.current?.handle as PetrinautDocHandle;
    const addPlace = (handle: PetrinautDocHandle, id: string) =>
      act(() => {
        handle.change((draft) => {
          draft.places.push({
            id,
            name: id,
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
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
    render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
    const handle = editorProps.current?.handle as PetrinautDocHandle;

    // Another tab moves net-1 on; its storage event has not reached this tab.
    // (Its place also keeps net-1 from being pruned as empty when net-2 opens.)
    const otherTabPlace = {
      id: toPetrinautId("other-tab-place"),
      name: "Other tab place",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
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
          differentialEquationId: null,
          x: 0,
          y: 0,
        });
      });
    });
    await screen.findByRole("alert");

    const loadPetriNet = editorProps.current?.loadPetriNet as (
      petriNetId: string,
    ) => void;
    act(() => loadPetriNet(netTwoId));
    await waitFor(() => expect(editorProps.current?.title).toBe("Second net"));
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => loadPetriNet(netOneId));
    await waitFor(() => expect(editorProps.current?.title).toBe("Seeded net"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

test("gives the editor the demo's plugins", () => {
  seedStoredNet();
  render(<LocalStorageDemoApp onSearchChange={() => {}} search={{}} />);
  expect(editorProps.current?.plugins).toBe(demoPlugins);
  cleanup();
});
