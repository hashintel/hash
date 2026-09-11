import { useLocalStorage } from "@mantine/hooks";

import type { SDCPN } from "@hashintel/petrinaut-core";

const rootLocalStorageKey = "petrinaut-sdcpn";

export type SDCPNInLocalStorage = {
  /**
   * Content-addressed coherent revisions retained by prepared fixtures. The
   * live `sdcpn` remains the automatic mirror; these snapshots give a settled
   * manifest a concrete document revision to select after a partial write.
   */
  coherentSnapshots?: Record<string, SDCPN>;
  id: string;
  uuid: string;
  lastUpdated: string; // ISO timestamp
  sdcpn: SDCPN;
  title: string;
};

type LocalStorageSDCPNsStore = Record<string, SDCPNInLocalStorage>;

export const emptySDCPN: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

export const isEmptySDCPN = (sdcpn: SDCPN) =>
  sdcpn.places.length === 0 &&
  sdcpn.transitions.length === 0 &&
  sdcpn.types.length === 0 &&
  sdcpn.parameters.length === 0 &&
  sdcpn.differentialEquations.length === 0 &&
  (sdcpn.subnets ?? []).length === 0 &&
  (sdcpn.componentInstances ?? []).length === 0 &&
  (sdcpn.scenarios ?? []).length === 0 &&
  (sdcpn.metrics ?? []).length === 0;

/**
 * Creates the localStorage record for a newly created net, keeping the generated
 * id and last-updated timestamp in sync.
 */
export const createLocalStorageNetRecord = (params: {
  petriNetDefinition: SDCPN;
  title: string;
}): SDCPNInLocalStorage => {
  const now = new Date();

  const uuid = crypto.randomUUID();

  return {
    id: uuid,
    uuid,
    title: params.title,
    sdcpn: params.petriNetDefinition,
    lastUpdated: now.toISOString(),
  };
};

type LegacyStore = Record<
  string,
  Omit<SDCPNInLocalStorage, "uuid"> & { uuid?: string }
>;

const readStore = (storage: Storage): LegacyStore => {
  const raw = storage.getItem(rootLocalStorageKey);

  if (raw === null) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Content the store cannot parse is replaced. `useLocalStorage` hands the
    // raw string to the editor, which lists no nets from it either.
    return {};
  }

  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as LegacyStore)
    : {};
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const readLocalStorageNets = (
  storage: Storage,
): LocalStorageSDCPNsStore => {
  const stored = readStore(storage);
  const usedUuids = new Set<string>();
  const nets = Object.fromEntries(
    Object.entries(stored).map(([id, net]) => {
      const candidate = net.uuid ?? net.id;
      const uuid =
        typeof candidate === "string" &&
        uuidPattern.test(candidate) &&
        !usedUuids.has(candidate.toLowerCase())
          ? candidate.toLowerCase()
          : crypto.randomUUID();
      usedUuids.add(uuid);
      return [id, { ...net, uuid }];
    }),
  );
  if (Object.entries(nets).some(([id, net]) => stored[id]?.uuid !== net.uuid)) {
    storage.setItem(rootLocalStorageKey, JSON.stringify(nets));
  }
  return nets;
};

export const saveLocalStorageNet = (
  storage: Storage,
  params: { petriNetDefinition: SDCPN; title: string },
): SDCPNInLocalStorage => {
  const nets = readLocalStorageNets(storage);
  const net = createLocalStorageNetRecord(params);
  storage.setItem(
    rootLocalStorageKey,
    JSON.stringify({ ...nets, [net.id]: net }),
  );
  return net;
};

export const startEmptyNetInStorage = (storage: Storage): SDCPNInLocalStorage =>
  saveLocalStorageNet(storage, {
    petriNetDefinition: emptySDCPN,
    title: "New Process",
  });

export const getInitialLocalStorageNet = (
  storage: Storage,
): SDCPNInLocalStorage =>
  Object.values(readLocalStorageNets(storage)).sort(
    (left, right) =>
      new Date(right.lastUpdated).getTime() -
      new Date(left.lastUpdated).getTime(),
  )[0] ?? startEmptyNetInStorage(storage);

export const useLocalStorageSDCPNs = () => {
  const [storedSDCPNs, setStoredSDCPNs] =
    useLocalStorage<LocalStorageSDCPNsStore>({
      key: rootLocalStorageKey,
      defaultValue: {},
      getInitialValueInEffect: false,
    });

  return { storedSDCPNs, setStoredSDCPNs };
};
