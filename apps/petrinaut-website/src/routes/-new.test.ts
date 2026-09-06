/**
 * @vitest-environment jsdom
 */
import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { Route } from "./new";

import type { SDCPNInLocalStorage } from "../main/app/local-storage-demo/use-local-storage-sdcpns";

/**
 * Node supplies its own `localStorage` global that shadows the jsdom one and
 * carries no `setItem`, so the route cannot write a net to it. An in-memory
 * store gives it one.
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

const visit = () => {
  const { beforeLoad } = Route.options;

  if (typeof beforeLoad !== "function") {
    throw new Error("/new should redirect from beforeLoad");
  }

  try {
    // The match arguments go unused: the route reads storage, not the URL.
    beforeLoad({} as never);
  } catch (thrown) {
    return thrown;
  }

  throw new Error("/new should throw a redirect");
};

const storedNets = (): SDCPNInLocalStorage[] =>
  Object.values(
    JSON.parse(localStorage.getItem("petrinaut-sdcpn") ?? "{}") as Record<
      string,
      SDCPNInLocalStorage
    >,
  );

describe("/new", () => {
  beforeEach(stubStorage);

  test("redirects to the editor without adding a history entry", () => {
    const thrown = visit();

    expect(isRedirect(thrown)).toBe(true);
    expect(thrown).toMatchObject({ options: { to: "/", replace: true } });
  });

  test("leaves one empty net for the editor to open", () => {
    visit();

    const nets = storedNets();

    expect(nets).toHaveLength(1);
    expect(nets[0]?.sdcpn.places).toStrictEqual([]);
  });

  test("adds no second empty net when visited again", () => {
    visit();
    visit();

    expect(storedNets()).toHaveLength(1);
  });
});
