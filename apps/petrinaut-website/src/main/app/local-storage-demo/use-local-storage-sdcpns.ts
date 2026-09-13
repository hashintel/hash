import { useCallback, useState } from "react";

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

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const documents = parsed as LocalStorageSDCPNsStore;
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
  if (needsNormalization)
    storage.setItem(rootLocalStorageKey, JSON.stringify(withIdentities));
  return withIdentities;
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

export const useLocalStorageSDCPNs = (input?: {
  readonly enabled: boolean;
}) => {
  const enabled = input?.enabled ?? true;
  const [state, setState] = useState(() => ({
    documents: enabled ? readStore(localStorage) : {},
    enabled,
  }));
  const storedSDCPNs =
    state.enabled === enabled
      ? state.documents
      : enabled
        ? readStore(localStorage)
        : {};
  if (state.enabled !== enabled) setState({ documents: storedSDCPNs, enabled });
  const setStoredSDCPNs = useCallback(
    (
      update:
        | LocalStorageSDCPNsStore
        | ((previous: LocalStorageSDCPNsStore) => LocalStorageSDCPNsStore),
    ) => {
      setState((previous) => {
        const current =
          enabled && previous.enabled
            ? previous.documents
            : readStore(localStorage);
        const next = typeof update === "function" ? update(current) : update;
        localStorage.setItem(rootLocalStorageKey, JSON.stringify(next));
        return { documents: next, enabled };
      });
    },
    [enabled],
  );

  return { storedSDCPNs, setStoredSDCPNs };
};
