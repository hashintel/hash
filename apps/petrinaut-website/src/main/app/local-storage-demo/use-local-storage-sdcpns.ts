import {
  canonicalizePetrinautIds,
  generatePetrinautId,
  toPetrinautId,
} from "@hashintel/petrinaut-core";

import { readBrowserStorage, writeBrowserStorage } from "./browser-storage";
import { usePersistedState } from "./use-persisted-state";

import type { RecordRevisionId } from "./documents/document-repository";
import type { SDCPN } from "@hashintel/petrinaut-core";

const rootLocalStorageKey = "petrinaut-sdcpn";

export type SDCPNInLocalStorage = {
  /** Assigned when a construction-bound document is created or first opened. */
  incarnationId?: string;
  /** The last write to this record; the next write must name it as predecessor. */
  revisionId?: RecordRevisionId;
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
  readonly id: string;
  readonly incarnationId?: unknown;
  readonly lastUpdated: string;
  readonly revisionId?: unknown;
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
    id: generatePetrinautId(),
    title: params.title,
    sdcpn: params.petriNetDefinition,
    lastUpdated: now.toISOString(),
    incarnationId: crypto.randomUUID(),
    revisionId: crypto.randomUUID(),
  };
};

/**
 * The stored envelope as written, before any entry is recognized as a document.
 * Content that is not a JSON object is treated as an empty envelope and is
 * replaced by the next write.
 */
const readRawStore = (storage: Storage): Record<string, unknown> => {
  const raw = readBrowserStorage(storage, rootLocalStorageKey);

  if (raw === null) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  return isRecord(parsed) ? parsed : {};
};

/**
 * Entries this version of the editor does not recognize as documents. They are
 * never listed, but every write carries them through unchanged so an entry
 * written by another version, or damaged in transit, is not silently deleted.
 */
const unrecognizedEntries = (
  raw: Record<string, unknown>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(raw).filter(
      ([documentId, value]) => !isStoredDocumentIngress(value, documentId),
    ),
  );

const writeStore = (
  storage: Storage,
  documents: LocalStorageSDCPNsStore,
  raw: Record<string, unknown> = readRawStore(storage),
): void =>
  writeBrowserStorage(
    storage,
    rootLocalStorageKey,
    JSON.stringify({ ...unrecognizedEntries(raw), ...documents }),
  );

/**
 * Whether a stored entry replaces the one already read under the same net id.
 * Two entries share a net id when one was written under a legacy id; the
 * later write wins, and on a tie the entry already keyed by its net id.
 */
const supersedes = (
  candidate: { readonly documentId: string; readonly lastUpdated: string },
  kept: SDCPNInLocalStorage | undefined,
): boolean =>
  kept === undefined ||
  candidate.lastUpdated > kept.lastUpdated ||
  (candidate.lastUpdated === kept.lastUpdated &&
    candidate.documentId === kept.id);

/**
 * Reads every recognized document, keyed by its net id. An entry stored under
 * a legacy id, with legacy subnet ids, or without its identity fields is
 * rewritten once, so the key, the record id and the subnet ids move together.
 */
const readStore = (storage: Storage): LocalStorageSDCPNsStore => {
  const raw = readRawStore(storage);
  const documents: LocalStorageSDCPNsStore = {};
  let needsNormalization = false;
  for (const [documentId, value] of Object.entries(raw)) {
    if (!isStoredDocumentIngress(value, documentId)) {
      continue;
    }
    const id = toPetrinautId(documentId);
    const sdcpn = canonicalizePetrinautIds(value.sdcpn);
    const incarnationId =
      typeof value.incarnationId === "string" ? value.incarnationId : undefined;
    const revisionId =
      typeof value.revisionId === "string" ? value.revisionId : undefined;
    needsNormalization ||=
      id !== documentId ||
      sdcpn !== value.sdcpn ||
      incarnationId === undefined ||
      revisionId === undefined;
    if (
      !supersedes({ documentId, lastUpdated: value.lastUpdated }, documents[id])
    ) {
      continue;
    }
    documents[id] = {
      id,
      title: value.title,
      lastUpdated: value.lastUpdated,
      sdcpn,
      // A moved record starts a new incarnation: Brunch bound the old one's
      // conversation to the old document id.
      incarnationId:
        id === documentId
          ? (incarnationId ?? crypto.randomUUID())
          : crypto.randomUUID(),
      revisionId: revisionId ?? crypto.randomUUID(),
    };
  }
  if (needsNormalization) {
    writeStore(storage, documents, raw);
  }
  return documents;
};

const readStoredSDCPNs = (): LocalStorageSDCPNsStore => readStore(localStorage);

const writeStoredSDCPNs = (documents: LocalStorageSDCPNsStore): void =>
  writeStore(localStorage, documents);

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

  writeStore(storage, { ...Object.fromEntries(kept), [net.id]: net });

  return net;
};

export const useLocalStorageSDCPNs = () => {
  const [storedSDCPNs, setStoredSDCPNs, ready] = usePersistedState({
    fallback: noStoredSDCPNs,
    read: readStoredSDCPNs,
    storageKey: rootLocalStorageKey,
    write: writeStoredSDCPNs,
  });

  return { ready, storedSDCPNs, setStoredSDCPNs };
};
