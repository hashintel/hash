/** @vitest-environment jsdom */
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import {
  emptySDCPN,
  saveLocalStorageNet,
} from "../main/app/local-storage-demo/use-local-storage-sdcpns";
import { routeTree } from "../routeTree.gen";

import type { ReactNode } from "react";

vi.mock("../main/app/local-storage-demo/local-storage-demo-app", () => ({
  LocalStorageDemoApp: ({ initialNetId }: { initialNetId?: string }) => (
    <div data-testid="document">{initialNetId}</div>
  ),
}));
vi.mock("../main/app/optimization-demo/browser-optimization-provider", () => ({
  BrowserOptimizationProvider: ({ children }: { children: ReactNode }) =>
    children,
}));

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
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

const save = (title: string) =>
  saveLocalStorageNet(localStorage, { petriNetDefinition: emptySDCPN, title });

test("opens the URL's document rather than the most recently edited document", async () => {
  const first = save("First");
  save("Second");
  await open(`/local/${first.uuid}`);
  expect((await screen.findByTestId("document")).textContent).toBe(first.id);
});

test("Back and Forward restore the document selected by the URL", async () => {
  const first = save("First");
  const second = save("Second");
  const router = await open(`/local/${first.uuid}`);
  await act(async () => {
    await router.navigate({
      to: "/local/$uuid",
      params: { uuid: second.uuid },
    });
  });
  expect(screen.getByTestId("document").textContent).toBe(second.id);
  await act(async () => {
    router.history.back();
  });
  await waitFor(() =>
    expect(screen.getByTestId("document").textContent).toBe(first.id),
  );
  await act(async () => {
    router.history.forward();
  });
  await waitFor(() =>
    expect(screen.getByTestId("document").textContent).toBe(second.id),
  );
});

test("a missing local URL explains browser storage without creating a file", async () => {
  await open("/local/550e8400-e29b-41d4-a716-446655440000");
  expect(await screen.findByText("Local document not found")).toBeTruthy();
  expect(localStorage.getItem("petrinaut-sdcpn")).toBeNull();
});

test("the home page creates a persistent document and redirects to its UUID", async () => {
  const router = await open("/");
  await waitFor(() =>
    expect(router.state.location.pathname).toMatch(/^\/local\/[0-9a-f-]{36}$/u),
  );
  const uuid = router.state.location.pathname.split("/").at(-1);
  expect(screen.getByTestId("document").textContent).toBe(uuid);
  expect(localStorage.getItem("petrinaut-sdcpn")).toContain(uuid);
});
