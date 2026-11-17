import { describe, expect, it, vi } from "vitest";

import { createReadableStore } from "../store";
import {
  createImportStore,
  isResolvingImports,
  resolvedLibraries,
  type ImportStates,
  type ResolveImport,
} from "./imports";
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
