import { describe, expect, test } from "vitest";

import {
  emptySDCPN,
  createLocalStorageNetRecord,
  readLocalStorageNets,
  saveLocalStorageNet,
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
  {
    id,
    uuid: crypto.randomUUID(),
    title: id,
    sdcpn,
    lastUpdated: new Date(0).toISOString(),
  },
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

  test("preserves empty documents so their URLs keep working", () => {
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
      ["net-empty", "net-drawn", net.id].sort(),
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

describe("local document identity", () => {
  test("creates distinct UUIDs even within the same millisecond", () => {
    const records = Array.from({ length: 100 }, () =>
      createLocalStorageNetRecord({
        petriNetDefinition: emptySDCPN,
        title: "New",
      }),
    );
    expect(new Set(records.map((record) => record.uuid)).size).toBe(
      records.length,
    );
    for (const record of records) {
      expect(record.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
      expect(record.id).toBe(record.uuid);
    }
  });

  test("persists legacy UUIDs without changing document or conversation keys", () => {
    const legacy = {
      id: "net-1",
      title: "Saved",
      sdcpn: drawnNet,
      lastUpdated: "2026-01-01T00:00:00Z",
    };
    const storage = createStorage(JSON.stringify({ "net-1": legacy }));
    storage.setItem("petrinaut-ai-messages", '{"net-1":[{"id":"message"}]}');
    const migrated = readLocalStorageNets(storage);
    expect(migrated["net-1"]).toMatchObject(legacy);
    expect(migrated["net-1"]?.uuid).toBeTruthy();
    expect(readLocalStorageNets(storage)).toEqual(migrated);
    expect(storage.getItem("petrinaut-ai-messages")).toBe(
      '{"net-1":[{"id":"message"}]}',
    );
  });

  test("repairs missing, malformed and duplicate UUIDs", () => {
    const original = createLocalStorageNetRecord({
      petriNetDefinition: drawnNet,
      title: "Original",
    });
    const storage = createStorage(
      JSON.stringify({
        [original.id]: original,
        duplicate: { ...original, id: "duplicate" },
        invalid: { ...original, id: "invalid", uuid: "invalid" },
      }),
    );
    const nets = readLocalStorageNets(storage);
    expect(nets[original.id]?.uuid).toBe(original.uuid);
    expect(new Set(Object.values(nets).map((net) => net.uuid)).size).toBe(3);
    expect(readLocalStorageNets(storage)).toEqual(nets);
  });

  test("forks copies independently and preserves the source definition", () => {
    const storage = createStorage();
    const first = saveLocalStorageNet(storage, {
      petriNetDefinition: structuredClone(drawnNet),
      title: "Example (copy)",
    });
    const second = saveLocalStorageNet(storage, {
      petriNetDefinition: structuredClone(drawnNet),
      title: "Example (copy)",
    });
    expect(first.uuid).not.toBe(second.uuid);
    expect(readNets(storage)[first.id]?.sdcpn).toEqual(drawnNet);
    first.sdcpn.places.length = 0;
    expect(drawnNet.places).toHaveLength(1);
    expect(readNets(storage)[second.id]?.sdcpn).toEqual(drawnNet);
  });
});
