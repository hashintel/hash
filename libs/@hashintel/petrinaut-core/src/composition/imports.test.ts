import { describe, expect, it, vi } from "vitest";

import { toPetrinautId } from "../document/petrinaut-id";
import { createReadableStore } from "../store";
import {
  createImportStore,
  describeImports,
  isResolvingImports,
  resolvedLibraries,
  type ImportStates,
  type ResolveImport,
} from "./imports";
import { resolveLibrary } from "./libraries";
import { logistics } from "./libraries.test-helpers";

import type { SDCPN } from "../types/sdcpn";
import type { Library } from "./libraries";

type Document = Pick<SDCPN, "imports">;

const importing = (...ids: string[]): Document => ({
  imports: ids.map((id) => ({ id })),
});

const storeOf = (
  document: Document,
  resolveImport?: ResolveImport,
  offered: readonly string[] = [],
) => {
  const definition = createReadableStore(document);
  const { store, dispose } = createImportStore({
    definition,
    resolveImport,
    offered,
  });
  return { definition, store, dispose };
};

/** A resolver whose answer the test gives when it chooses. */
const deferred = () => {
  let settle: (library: Library | undefined) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const resolveImport = vi.fn<ResolveImport>(
    () =>
      new Promise((resolve, reject) => {
        settle = resolve;
        fail = reject;
      }),
  );
  return {
    resolveImport,
    settle: (library: Library | undefined) => settle(library),
    fail: (error: Error) => fail(error),
  };
};

/** Lets a settled promise reach its handlers. */
const settled = () => Promise.resolve();

describe("describeImports", () => {
  it("lists each import with its state, and a resolved library's components with the ids a document names", () => {
    const { resolveImport, settle } = deferred();
    const { store } = storeOf(
      importing(logistics.id, "@hashintel/later", "@hashintel/unknown"),
      (id) => {
        if (id === logistics.id) {
          return logistics;
        }
        return id === "@hashintel/later" ? resolveImport(id) : undefined;
      },
    );
    void settle;

    expect(describeImports(store.get())).toEqual([
      {
        id: logistics.id,
        status: "resolved",
        name: "Logistics",
        components: [
          {
            id: "scale",
            name: "Scale",
            description: "Weighs what passes",
            interface: true,
            ports: [
              { id: toPetrinautId("in"), name: "In", direction: "in" },
              { id: toPetrinautId("out"), name: "Out", direction: "out" },
            ],
            parameters: [
              expect.objectContaining({
                id: toPetrinautId("rate"),
                variableName: "rate",
              }),
            ],
          },
          expect.objectContaining({
            id: "belt",
            interface: false,
            // Read off the body's arcs, which the library left to it.
            ports: [
              { id: toPetrinautId("in"), name: "In", direction: "in" },
              { id: toPetrinautId("out"), name: "Out", direction: "out" },
            ],
          }),
        ],
      },
      { id: "@hashintel/later", status: "resolving" },
      {
        id: "@hashintel/unknown",
        status: "failed",
        message:
          "The application does not know the library `@hashintel/unknown`.",
      },
    ]);
  });

  it("reads a component's arcs once for the directions of its ports, however many", () => {
    // A thousand ports that the library leaves to the body's arcs, 20,000
    // of them.
    const names = Array.from({ length: 1000 }, (_, index) => `Port${index}`);
    const wide: Library = {
      id: "@hashintel/wide",
      name: "Wide",
      components: [
        {
          id: "sink",
          name: "Sink",
          ports: names.map((name) => ({ id: name, name })),
          body: {
            places: names.map((name) => ({
              id: name,
              name,
              colorId: null,
              dynamicsEnabled: false,
              x: 0,
              y: 0,
            })),
            transitions: Array.from({ length: 20 }, (_, index) => ({
              id: `take-${index}`,
              name: `Take${index}`,
              inputArcs: names.map((placeId) => ({
                placeId,
                weight: 1,
                type: "standard" as const,
              })),
              outputArcs: [],
              lambdaType: "predicate" as const,
              lambdaCode: "",
              transitionKernelCode: "",
              x: 0,
              y: 0,
            })),
          },
        },
      ],
    };
    const states: ImportStates = new Map([
      [wide.id, { status: "resolved", library: resolveLibrary(wide.id, wide) }],
    ]);

    const started = Date.now();
    const [summary] = describeImports(states);
    const elapsed = Date.now() - started;

    const ports =
      summary?.status === "resolved" ? summary.components[0]?.ports : [];
    expect(ports).toHaveLength(names.length);
    expect(new Set(ports?.map(({ direction }) => direction))).toEqual(
      new Set(["in"]),
    );
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe("createImportStore", () => {
  it("resolves a library given in memory at once", () => {
    const resolveImport = vi.fn<ResolveImport>(() => logistics);
    const { store } = storeOf(importing(logistics.id), resolveImport);

    expect(store.get().get(logistics.id)).toMatchObject({
      status: "resolved",
      library: { name: "Logistics" },
    });
    expect(resolveImport).toHaveBeenCalledExactlyOnceWith(logistics.id);
  });

  it("holds an import as resolving until its library arrives, then tells its subscribers", async () => {
    const { resolveImport, settle } = deferred();
    const { store } = storeOf(importing(logistics.id), resolveImport);
    const seen: ImportStates[] = [];
    store.subscribe((states) => seen.push(states));

    expect(store.get().get(logistics.id)).toEqual({ status: "resolving" });
    expect(isResolvingImports(importing(logistics.id), store.get())).toBe(true);

    settle(logistics);
    await settled();

    expect(seen).toHaveLength(1);
    expect(store.get().get(logistics.id)?.status).toBe("resolved");
    expect(isResolvingImports(importing(logistics.id), store.get())).toBe(
      false,
    );
    expect([...resolvedLibraries(store.get()).keys()]).toEqual([logistics.id]);
  });

  it("gives the same libraries for the same states", () => {
    const { store } = storeOf(importing(logistics.id), () => logistics);

    expect(resolvedLibraries(store.get())).toBe(resolvedLibraries(store.get()));
  });

  it("resolves each import once, however often it is read", () => {
    const resolveImport = vi.fn<ResolveImport>(() => logistics);
    const { store } = storeOf(importing(logistics.id), resolveImport);

    store.get();
    store.get();

    expect(resolveImport).toHaveBeenCalledOnce();
  });

  it("resolves an import when it joins the document", () => {
    const resolveImport = vi.fn<ResolveImport>(() => logistics);
    const { definition, store } = storeOf(importing(), resolveImport);
    const seen: ImportStates[] = [];
    store.subscribe((states) => seen.push(states));
    expect(resolveImport).not.toHaveBeenCalled();

    definition.set(importing(logistics.id));

    expect(seen.at(-1)?.get(logistics.id)?.status).toBe("resolved");
  });

  it("finds an import that joined a document nobody was subscribed to", () => {
    const resolveImport = vi.fn<ResolveImport>(() => logistics);
    const { definition, store } = storeOf(importing(), resolveImport);

    definition.set(importing(logistics.id));

    expect(store.get().get(logistics.id)?.status).toBe("resolved");
  });

  it("resolves the libraries on offer, whether the document imports them or not", () => {
    const { store } = storeOf(importing(), () => logistics, [logistics.id]);

    expect(store.get().get(logistics.id)?.status).toBe("resolved");
  });

  it("tells its subscribers once of the imports that join the document together", () => {
    const { definition, store } = storeOf(importing(), () => undefined);
    const before = store.get();
    const seen: ImportStates[] = [];
    store.subscribe((states) => seen.push(states));

    definition.set(importing("@hashintel/one", "@hashintel/two"));

    expect(seen).toHaveLength(1);
    expect([...store.get().keys()]).toEqual([
      "@hashintel/one",
      "@hashintel/two",
    ]);
    // The states handed out earlier stay as they were.
    expect(before.size).toBe(0);
  });

  it("takes the imports of a long list into one copy of the states", () => {
    const ids = Array.from(
      { length: 20_000 },
      (_, index) => `@hashintel/library-${index}`,
    );

    const started = Date.now();
    const { store } = storeOf(importing(...ids));
    const states = store.get();
    const elapsed = Date.now() - started;

    expect(states.size).toBe(ids.length);
    // One copy takes milliseconds; a copy for every import takes several
    // seconds.
    expect(elapsed).toBeLessThan(1_000);
  });

  it("fails an import the host does not know", () => {
    const { store } = storeOf(importing("@hashintel/unknown"), () => undefined);

    expect(store.get().get("@hashintel/unknown")).toEqual({
      status: "failed",
      message:
        "The application does not know the library `@hashintel/unknown`.",
    });
  });

  it("fails an import with the reason its host gives", async () => {
    const { resolveImport, fail } = deferred();
    const { store } = storeOf(importing(logistics.id), resolveImport);

    fail(new Error("The registry is offline."));
    await settled();
    await settled();

    expect(store.get().get(logistics.id)).toEqual({
      status: "failed",
      message: "The registry is offline.",
    });
  });

  it("fails an import whose library does not pass its checks, saying why", () => {
    const [scale] = logistics.components;
    const library = { ...logistics, components: [scale!, scale!] };
    const { store } = storeOf(importing(logistics.id), () => library);

    expect(store.get().get(logistics.id)).toEqual({
      status: "failed",
      message:
        "The library `@hashintel/logistics` has two components with the id `scale`: `Scale` and `Scale`.",
    });
  });

  it("fails every import when the host resolves none", () => {
    const { store } = storeOf(importing(logistics.id));

    expect(store.get().get(logistics.id)).toEqual({
      status: "failed",
      message: "The application resolves no imports.",
    });
  });

  it("says nothing more once it is disposed of", async () => {
    const { resolveImport, settle } = deferred();
    const { store, dispose } = storeOf(importing(logistics.id), resolveImport);
    const listener = vi.fn();
    store.subscribe(listener);

    dispose();
    settle(logistics);
    await settled();

    expect(listener).not.toHaveBeenCalled();
    expect(store.get().get(logistics.id)).toEqual({ status: "resolving" });
  });
});
