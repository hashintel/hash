/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { defaultPetrinautNavigationState } from "@hashintel/petrinaut/react";

import { renderEditorWith } from "../main/app/plugins/_shared/testing/render-editor-with";
import { localCopyPlugin } from "./local-copy-plugin";

import type { SDCPNInLocalStorage } from "../main/app/local-storage-demo/use-local-storage-sdcpns";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../main/app/shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

/**
 * Node 25 and later supply their own `localStorage` global, which shadows
 * jsdom's and has no `setItem`. An in-memory store stands in on every version,
 * fresh for each test. Globals stay stubbed after a test: the editor's language
 * server starts lazily, on the `Worker` that `renderEditorWith` stubs.
 */
beforeEach(() => {
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
  navigate.mockReset();
});

const storedNets = (): SDCPNInLocalStorage[] =>
  Object.values(
    JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as Record<
      string,
      SDCPNInLocalStorage
    >,
  );

test("saves a copy of the read-only net and opens its local URL with the current view", async () => {
  const { handle } = renderEditorWith([localCopyPlugin], {
    navigation: {
      state: { ...defaultPetrinautNavigationState, mode: "simulate" },
      onNavigate: () => {},
    },
    readonly: true,
    title: "SIR model",
  });
  act(() =>
    handle.change((draft) => {
      draft.description = "Susceptible, infected, recovered";
    }),
  );

  fireEvent.click(
    await screen.findByRole("button", { name: "Make a local copy" }),
  );

  const [copy] = storedNets();
  expect(copy?.title).toBe("SIR model (copy)");
  expect(copy?.sdcpn.description).toBe("Susceptible, infected, recovered");
  expect(copy?.sdcpn).toEqual(handle.doc());
  expect(navigate).toHaveBeenCalledWith({
    to: "/local/$netId",
    params: { netId: copy?.id },
    search: { mode: "simulate" },
  });
});

test("explains a refused save and stays on the page", async () => {
  renderEditorWith([localCopyPlugin], { readonly: true, title: "SIR model" });
  localStorage.setItem = () => {
    throw new DOMException("Storage full", "QuotaExceededError");
  };

  fireEvent.click(
    await screen.findByRole("button", { name: "Make a local copy" }),
  );

  expect(screen.getByRole("alert").textContent).toBe(
    "Couldn't save: browser storage is full or blocked",
  );
  expect(navigate).not.toHaveBeenCalled();
});

test("offers the same copy on the notice of a blocked edit", async () => {
  renderEditorWith([localCopyPlugin], { readonly: true, title: "SIR model" });
  await screen.findByRole("button", { name: "Make a local copy" });

  fireEvent.keyDown(document.body, { key: "n" });
  await screen.findByText("This document is read-only.");
  fireEvent.click(
    within(screen.getByRole("region", { name: /^Notifications/ })).getByRole(
      "button",
      { name: "Make a local copy" },
    ),
  );

  const [copy] = storedNets();
  expect(copy?.title).toBe("SIR model (copy)");
  expect(navigate).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "/local/$netId",
      params: { netId: copy?.id },
    }),
  );
});
