/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import {
  createLocalStorageNetRecord,
  emptySDCPN,
  type SDCPNInLocalStorage,
  startEmptyNetInStorage,
  useLocalStorageSDCPNs,
} from "./use-local-storage-sdcpns";

import type { SDCPN } from "@hashintel/petrinaut-core";

const rootLocalStorageKey = "petrinaut-sdcpn";

const createStorage = (initial?: string): Storage => {
  const values = new Map<string, string>(
    initial === undefined ? [] : [[rootLocalStorageKey, initial]],
  );

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => void values.delete(key),
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

const readNets = (storage: Storage): Record<string, SDCPNInLocalStorage> =>
  JSON.parse(storage.getItem(rootLocalStorageKey) ?? "{}") as Record<
    string,
    SDCPNInLocalStorage
  >;

const drawnNet: SDCPN = {
  ...emptySDCPN,
  places: [
    {
      id: "place-1",
      name: "Susceptible",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
};

const storedNet = (id: string, sdcpn: SDCPN): [string, SDCPNInLocalStorage] => [
  id,
  { id, title: id, sdcpn, lastUpdated: new Date(0).toISOString() },
];

/** An entry whose `sdcpn` this version of the editor cannot read as a net. */
const foreignEntry = {
  id: "net-foreign",
  title: "Written by another version",
  lastUpdated: new Date(0).toISOString(),
  sdcpn: { nodes: [{ id: "place-1" }], edges: [] },
};

describe("createLocalStorageNetRecord", () => {
  test("assigns incarnation and document revision identities at creation", () => {
    const net = createLocalStorageNetRecord({
      petriNetDefinition: emptySDCPN,
      title: "New Process",
    });

    expect(net.incarnationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
    expect(net.revisionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
  });
});

describe("startEmptyNetInStorage", () => {
  test("writes an empty net into an untouched store", () => {
    const storage = createStorage();

    const net = startEmptyNetInStorage(storage);

    expect(readNets(storage)).toStrictEqual({ [net.id]: net });
    expect(net.sdcpn).toStrictEqual(emptySDCPN);
  });

  test("keeps the nets the visitor has drawn", () => {
    const storage = createStorage(
      JSON.stringify(Object.fromEntries([storedNet("net-drawn", drawnNet)])),
    );

    const net = startEmptyNetInStorage(storage);

    expect(Object.keys(readNets(storage)).sort()).toStrictEqual(
      ["net-drawn", net.id].sort(),
    );
  });

  test("drops the empty nets an earlier visit left behind", () => {
    const storage = createStorage(
      JSON.stringify(
        Object.fromEntries([
          storedNet("net-empty", emptySDCPN),
          storedNet("net-drawn", drawnNet),
        ]),
      ),
    );

    const net = startEmptyNetInStorage(storage);

    expect(Object.keys(readNets(storage)).sort()).toStrictEqual(
      ["net-drawn", net.id].sort(),
    );
  });

  test("opens the new net, which is the most recently modified one", () => {
    const storage = createStorage(
      JSON.stringify(
        Object.fromEntries([
          [
            "net-drawn",
            {
              id: "net-drawn",
              title: "net-drawn",
              sdcpn: drawnNet,
              lastUpdated: new Date(8_640_000_000).toISOString(),
            },
          ],
        ]),
      ),
    );

    const net = startEmptyNetInStorage(storage);
    const nets = Object.values(readNets(storage));
    const mostRecent = nets.sort(
      (a, b) =>
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime(),
    )[0];

    expect(mostRecent?.id).toBe(net.id);
  });

  test("keeps an entry it does not recognize as a net", () => {
    const storage = createStorage(
      JSON.stringify({
        ...Object.fromEntries([storedNet("net-drawn", drawnNet)]),
        "net-foreign": foreignEntry,
      }),
    );

    const net = startEmptyNetInStorage(storage);

    const nets = readNets(storage);
    expect(Object.keys(nets).sort()).toStrictEqual(
      ["net-drawn", "net-foreign", net.id].sort(),
    );
    expect(nets["net-foreign"]).toStrictEqual(foreignEntry);
  });

  test("replaces content it cannot parse", () => {
    const storage = createStorage("not json");

    const net = startEmptyNetInStorage(storage);

    expect(readNets(storage)).toStrictEqual({ [net.id]: net });
  });

  test("replaces a stored value that is not a net store", () => {
    const storage = createStorage(JSON.stringify(["net-1"]));

    const net = startEmptyNetInStorage(storage);

    expect(readNets(storage)).toStrictEqual({ [net.id]: net });
  });
});

describe("useLocalStorageSDCPNs", () => {
  afterEach(() => localStorage.clear());

  test("keeps an unrecognized entry while assigning identities to the nets it reads", () => {
    localStorage.setItem(
      rootLocalStorageKey,
      JSON.stringify({
        ...Object.fromEntries([storedNet("net-drawn", drawnNet)]),
        "net-foreign": foreignEntry,
      }),
    );

    const { result } = renderHook(() => useLocalStorageSDCPNs());

    expect(result.current.ready).toBe(true);
    expect(Object.keys(result.current.storedSDCPNs)).toStrictEqual([
      "net-drawn",
    ]);
    const written = readNets(localStorage);
    expect(written["net-drawn"]?.incarnationId).toBeTypeOf("string");
    expect(written["net-drawn"]?.revisionId).toBeTypeOf("string");
    expect(written["net-foreign"]).toStrictEqual(foreignEntry);
  });

  test("keeps an unrecognized entry when the editor writes its nets", () => {
    localStorage.setItem(
      rootLocalStorageKey,
      JSON.stringify({ "net-foreign": foreignEntry }),
    );
    const { result } = renderHook(() => useLocalStorageSDCPNs());
    const net = createLocalStorageNetRecord({
      petriNetDefinition: drawnNet,
      title: "Drawn",
    });

    act(() =>
      result.current.setStoredSDCPNs((previous) => ({
        ...previous,
        [net.id]: net,
      })),
    );

    expect(Object.keys(result.current.storedSDCPNs)).toStrictEqual([net.id]);
    expect(readNets(localStorage)).toStrictEqual({
      "net-foreign": foreignEntry,
      [net.id]: net,
    });
  });
});
