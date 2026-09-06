import { useLocalStorage } from "@mantine/hooks";

import type { SDCPN } from "@hashintel/petrinaut-core";

const rootLocalStorageKey = "petrinaut-sdcpn";

export type SDCPNInLocalStorage = {
  id: string;
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

  return {
    id: `net-${now.getTime()}`,
    title: params.title,
    sdcpn: params.petriNetDefinition,
    lastUpdated: now.toISOString(),
  };
};

const readStore = (storage: Storage): LocalStorageSDCPNsStore => {
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
    ? (parsed as LocalStorageSDCPNsStore)
    : {};
};

/**
 * Adds an empty net to `storage` and returns it, dropping the empty nets earlier
 * visits left behind. The editor prunes an empty net when the visitor switches
 * away from it, so a URL that starts nets holds to the same rule.
 */
export const startEmptyNetInStorage = (
  storage: Storage,
): SDCPNInLocalStorage => {
  const net = createLocalStorageNetRecord({
    petriNetDefinition: emptySDCPN,
    title: "New Process",
  });

  const kept = Object.entries(readStore(storage)).filter(
    ([, stored]) => !isEmptySDCPN(stored.sdcpn),
  );

  storage.setItem(
    rootLocalStorageKey,
    JSON.stringify({ ...Object.fromEntries(kept), [net.id]: net }),
  );

  return net;
};

export const useLocalStorageSDCPNs = () => {
  const [storedSDCPNs, setStoredSDCPNs] =
    useLocalStorage<LocalStorageSDCPNsStore>({
      key: rootLocalStorageKey,
      defaultValue: {},
      getInitialValueInEffect: false,
    });

  return { storedSDCPNs, setStoredSDCPNs };
};
