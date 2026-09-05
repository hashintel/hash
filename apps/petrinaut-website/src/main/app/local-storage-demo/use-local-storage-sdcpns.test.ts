import { describe, expect, test } from "vitest";

import {
  emptySDCPN,
  type SDCPNInLocalStorage,
  startEmptyNetInStorage,
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
