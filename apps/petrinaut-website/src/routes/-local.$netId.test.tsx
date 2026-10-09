/**
 * @vitest-environment jsdom
 */
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  emptySDCPN,
  saveNetInStorage,
} from "../main/app/local-storage-demo/use-local-storage-sdcpns";
import { routeTree } from "../routeTree.gen";

import type { ReactNode } from "react";

vi.mock("@hashintel/petrinaut/ui", () => ({ Petrinaut: () => null }));
vi.mock("../main/app/local-storage-demo/local-storage-demo-app", () => ({
  LocalStorageDemoApp: ({ netId }: { netId: string }) => (
    <div data-testid="document">{netId}</div>
  ),
}));
vi.mock("../main/app/optimization-demo/browser-optimization-provider", () => ({
  BrowserOptimizationProvider: ({ children }: { children: ReactNode }) =>
    children,
}));

/**
 * Node supplies its own `localStorage` global that shadows the jsdom one and
 * carries no `setItem`. An in-memory store gives the routes one.
 */
beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = async (path: string) => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await act(async () => {
    await router.load();
  });
  render(<RouterProvider router={router} />);
  return router;
};

const save = (title: string) =>
  saveNetInStorage(localStorage, { petriNetDefinition: emptySDCPN, title });

const openDocument = () => screen.getByTestId("document").textContent;

test("opens the net the URL names, not the most recently edited one", async () => {
  const first = save("First");
  save("Second");

  await open(`/local/${first.id}`);

  expect((await screen.findByTestId("document")).textContent).toBe(first.id);
});

test("Back and Forward reopen the net each URL names", async () => {
  const first = save("First");
  const second = save("Second");
  const router = await open(`/local/${first.id}`);

  await act(async () => {
    await router.navigate({
      to: "/local/$netId",
      params: { netId: second.id },
    });
  });
  expect(openDocument()).toBe(second.id);

  act(() => router.history.back());
  await waitFor(() => expect(openDocument()).toBe(first.id));

  act(() => router.history.forward());
  await waitFor(() => expect(openDocument()).toBe(second.id));
});

test("the home page opens the most recently edited net at its URL", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(0);
  save("First");
  vi.setSystemTime(1_000);
  const second = save("Second");
  vi.useRealTimers();

  const router = await open("/?subnet=subnet-1");

  expect(router.state.location.pathname).toBe(`/local/${second.id}`);
  expect(router.state.location.search).toEqual({ subnet: "subnet-1" });
});

test("the home page saves a net when the browser holds none", async () => {
  const router = await open("/");

  const netId = router.state.location.pathname.split("/").at(-1) ?? "";
  expect(router.state.location.pathname).toMatch(/^\/local\/[0-9a-f-]{36}$/u);
  expect(localStorage.getItem("petrinaut-sdcpn")).toContain(netId);
  expect((await screen.findByTestId("document")).textContent).toBe(netId);
});

test("the home page explains a storage failure instead of opening an unsaved net", async () => {
  localStorage.setItem = () => {
    throw new DOMException("Storage unavailable", "SecurityError");
  };

  const router = await open("/");

  expect(router.state.location.pathname).toBe("/");
  expect(await screen.findByText("Couldn't save a document")).toBeTruthy();
});
