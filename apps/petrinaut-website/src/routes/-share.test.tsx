/// <reference types="node" />
/** @vitest-environment jsdom */
import { createRequire } from "node:module";

import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { sirModel } from "@hashintel/petrinaut-core/examples";

import { routeTree } from "../routeTree.gen";
import {
  parseSnapshot,
  serializeSnapshot,
  type Snapshot,
} from "../sharing/snapshot";
import { openSnapshot } from "../sharing/snapshot-client";
import {
  compressSnapshot,
  decompressSnapshot,
} from "../sharing/snapshot-codec";

import type { ReadonlyDocumentPageProps } from "../main/app/readonly-document-page";
import type { BrotliWasmType } from "brotli-wasm";
import type { ReactNode } from "react";

vi.mock("../sharing/snapshot-client", () => ({ openSnapshot: vi.fn() }));
vi.mock("../main/app/local-storage-demo/local-storage-demo-app", () => ({
  LocalStorageDemoApp: ({ initialNetId }: { initialNetId?: string }) => (
    <div data-testid="local-document">{initialNetId}</div>
  ),
}));
vi.mock("../main/app/optimization-demo/browser-optimization-provider", () => ({
  BrowserOptimizationProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
vi.mock("../main/app/readonly-document-page", () => ({
  ReadonlyDocumentPage: ({
    handle,
    title,
    search,
    onSearchChange,
    onFork,
  }: ReadonlyDocumentPageProps) => (
    <div>
      <h1>{title}</h1>
      <span data-testid="readonly">
        {String(handle.capabilities?.readonly)}
      </span>
      <span data-testid="view">{search.mode ?? "edit"}</span>
      <button
        type="button"
        onClick={() =>
          onSearchChange({ mode: "simulate", view: "scenarios" }, "push")
        }
      >
        Scenarios
      </button>
      <button type="button" onClick={() => onSearchChange({}, "push")}>
        Edit
      </button>
      <button type="button" onClick={onFork}>
        Make a local copy
      </button>
    </div>
  ),
}));

const brotli = createRequire(import.meta.url)("brotli-wasm") as BrotliWasmType;
const encodeSnapshot = (input: Snapshot, codec: BrotliWasmType) =>
  compressSnapshot(serializeSnapshot(input), codec);
const decodeSnapshot = (hash: string, codec: BrotliWasmType) =>
  parseSnapshot(decompressSnapshot(hash, codec));
const hash = encodeSnapshot(
  { title: "Shared SIR", definition: sirModel.petriNetDefinition },
  brotli,
);

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
    clear: () => entries.clear(),
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
  } satisfies Storage);
  vi.mocked(openSnapshot).mockImplementation(async (input) =>
    decodeSnapshot(input, brotli),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const open = async (path: string) => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMinMs: 0,
  });
  await act(async () => {
    await router.load();
  });
  render(<RouterProvider router={router} />);
  return router;
};

test("opens a snapshot in a fresh browser without saving a document", async () => {
  await open(`/share?mode=simulate&view=scenarios#${hash}`);
  expect(await screen.findByText("Shared SIR")).toBeTruthy();
  expect(screen.getByTestId("readonly").textContent).toBe("true");
  expect(screen.getByTestId("view").textContent).toBe("simulate");
  expect(localStorage.getItem("petrinaut-sdcpn")).toBeNull();
});

test("retains the snapshot through view changes and Back/Forward", async () => {
  const router = await open(`/share#${hash}`);
  await screen.findByText("Shared SIR");
  fireEvent.click(screen.getByText("Scenarios"));
  await waitFor(() =>
    expect(router.state.location.search.mode).toBe("simulate"),
  );
  expect(router.state.location.hash).toBe(hash);
  fireEvent.click(screen.getByText("Edit"));
  await waitFor(() =>
    expect(router.state.location.search.mode).toBeUndefined(),
  );
  await act(async () => {
    router.history.back();
  });
  await waitFor(() =>
    expect(screen.getByTestId("view").textContent).toBe("simulate"),
  );
  await act(async () => {
    router.history.forward();
  });
  await waitFor(() =>
    expect(screen.getByTestId("view").textContent).toBe("edit"),
  );
  expect(openSnapshot).toHaveBeenCalledTimes(1);
});

test("forks into a new local UUID and preserves the current view", async () => {
  const router = await open(`/share?mode=simulate&view=scenarios#${hash}`);
  await screen.findByText("Shared SIR");
  fireEvent.click(screen.getByText("Make a local copy"));
  await screen.findByTestId("local-document");
  expect(router.state.location.pathname).toMatch(/^\/local\/[0-9a-f-]{36}$/u);
  expect(router.state.location.hash).toBe("");
  expect(router.state.location.search.mode).toBe("simulate");
  expect(localStorage.getItem("petrinaut-sdcpn")).toContain(
    "Shared SIR (copy)",
  );
});

test("changing the fragment loads a different document", async () => {
  const router = await open(`/share#${hash}`);
  await screen.findByText("Shared SIR");
  const nextHash = encodeSnapshot(
    { title: "Another snapshot", definition: sirModel.petriNetDefinition },
    brotli,
  );
  await act(async () => {
    await router.navigate({ to: "/share", hash: nextHash });
  });
  expect(await screen.findByText("Another snapshot")).toBeTruthy();
});

test.each(["", "v1.br.broken", "v2.br.AAAA"])(
  "handles invalid or unsupported snapshot %s without saving",
  async (input) => {
    await open(`/share#${input}`);
    expect(await screen.findByText("Couldn't open snapshot")).toBeTruthy();
    expect(localStorage.getItem("petrinaut-sdcpn")).toBeNull();
  },
);
