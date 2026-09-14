import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { usePersistedState } from "./use-persisted-state";

import type { DocumentRevisionId, SDCPN } from "@hashintel/petrinaut-core";

const rootLocalStorageKey = "petrinaut-sdcpn";

export type SDCPNInLocalStorage = {
  /** Assigned when a construction-bound document is created or first opened. */
  incarnationId?: string;
  /** Petrinaut revision retained when the document handle is reopened. */
  revisionId?: DocumentRevisionId;
  /** Immutable request base for the single prepared root-arc tracer. */
  rootArcRequestedBaseHash?: string;
  /**
   * Content-addressed coherent revisions retained by prepared fixtures. The
   * live `sdcpn` remains the automatic mirror; these snapshots give a settled
   * manifest a concrete document revision to select after a partial write.
   */
  coherentSnapshots?: Record<string, SDCPN>;
  id: string;
  lastUpdated: string; // ISO timestamp
  sdcpn: SDCPN;
  title: string;
};

type LocalStorageSDCPNsStore = Record<string, SDCPNInLocalStorage>;
const noStoredSDCPNs: LocalStorageSDCPNsStore = {};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStoredSDCPN = (value: unknown): value is SDCPN =>
  isRecord(value) &&
  Array.isArray(value.places) &&
  Array.isArray(value.transitions) &&
  Array.isArray(value.types) &&
  Array.isArray(value.parameters) &&
  Array.isArray(value.differentialEquations);

type StoredDocumentIngress = {
  readonly coherentSnapshots?: unknown;
  readonly id: string;
  readonly incarnationId?: unknown;
  readonly lastUpdated: string;
  readonly revisionId?: unknown;
  readonly rootArcRequestedBaseHash?: unknown;
  readonly sdcpn: SDCPN;
  readonly title: string;
};

const isStoredDocumentIngress = (
  value: unknown,
  documentId: string,
): value is StoredDocumentIngress =>
  isRecord(value) &&
  value.id === documentId &&
  typeof value.id === "string" &&
  typeof value.title === "string" &&
  typeof value.lastUpdated === "string" &&
  isStoredSDCPN(value.sdcpn);

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
    incarnationId: crypto.randomUUID(),
    revisionId: crypto.randomUUID(),
  };
};

const readStore = (storage: Storage): LocalStorageSDCPNsStore => {
  const raw = readBrowserStorage(storage, rootLocalStorageKey);

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

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const documents: LocalStorageSDCPNsStore = {};
  for (const [documentId, value] of Object.entries(parsed)) {
    if (!isStoredDocumentIngress(value, documentId)) {
      continue;
    }
    const incarnationId =
      typeof value.incarnationId === "string" ? value.incarnationId : undefined;
    const revisionId =
      typeof value.revisionId === "string" ? value.revisionId : undefined;
    const rootArcRequestedBaseHash =
      typeof value.rootArcRequestedBaseHash === "string"
        ? value.rootArcRequestedBaseHash
        : undefined;
    let coherentSnapshots: Record<string, SDCPN> | undefined;
    if (isRecord(value.coherentSnapshots)) {
      coherentSnapshots = {};
      for (const [hash, snapshot] of Object.entries(value.coherentSnapshots)) {
        if (isStoredSDCPN(snapshot)) {
          coherentSnapshots[hash] = snapshot;
        }
      }
    }
    documents[documentId] = {
      id: value.id,
      title: value.title,
      lastUpdated: value.lastUpdated,
      sdcpn: value.sdcpn,
      ...(incarnationId === undefined ? {} : { incarnationId }),
      ...(revisionId === undefined ? {} : { revisionId }),
      ...(rootArcRequestedBaseHash === undefined
        ? {}
        : { rootArcRequestedBaseHash }),
      ...(coherentSnapshots === undefined ? {} : { coherentSnapshots }),
    };
  }
  const needsNormalization = Object.values(documents).some(
    (document) =>
      document.incarnationId === undefined || document.revisionId === undefined,
  );
  const withIdentities = Object.fromEntries(
    Object.entries(documents).map(([documentId, document]) => {
      if (
        document.incarnationId !== undefined &&
        document.revisionId !== undefined
      ) {
        return [documentId, document];
      }
      return [
        documentId,
        {
          ...document,
          incarnationId: document.incarnationId ?? crypto.randomUUID(),
          revisionId: document.revisionId ?? crypto.randomUUID(),
        },
      ];
    }),
  );
  if (needsNormalization) {
    writeBrowserStorage(
      storage,
      rootLocalStorageKey,
      JSON.stringify(withIdentities),
    );
  }
  return withIdentities;
};

const readStoredSDCPNs = (): LocalStorageSDCPNsStore => readStore(localStorage);

const writeStoredSDCPNs = (documents: LocalStorageSDCPNsStore): void =>
  writeBrowserStorage(
    localStorage,
    rootLocalStorageKey,
    JSON.stringify(documents),
  );

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

  writeBrowserStorage(
    storage,
    rootLocalStorageKey,
    JSON.stringify({ ...Object.fromEntries(kept), [net.id]: net }),
  );

  return net;
};

export const useLocalStorageSDCPNs = (input?: {
  readonly enabled: boolean;
}) => {
  const enabled = input?.enabled ?? true;
  const [storedSDCPNs, setStoredSDCPNs, ready] = usePersistedState({
    enabled,
    fallback: noStoredSDCPNs,
    read: readStoredSDCPNs,
    storageKey: rootLocalStorageKey,
    write: writeStoredSDCPNs,
    writeWhenDisabled: true,
  });

  return { ready, storedSDCPNs, setStoredSDCPNs };
};
