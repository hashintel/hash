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

const serializeStore = (
  documents: LocalStorageSDCPNsStore,
  raw: Record<string, unknown>,
): string => JSON.stringify({ ...unrecognizedEntries(raw), ...documents });

const writeStore = (
  storage: Storage,
  documents: LocalStorageSDCPNsStore,
  raw: Record<string, unknown> = readRawStore(storage),
): void =>
  writeBrowserStorage(
    storage,
    rootLocalStorageKey,
    serializeStore(documents, raw),
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
 * a legacy id, with legacy entity ids, or without a revision id is
 * rewritten once, so the key, the record id and the entity ids move together.
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
    const revisionId =
      typeof value.revisionId === "string" ? value.revisionId : undefined;
    needsNormalization ||=
      id !== documentId || sdcpn !== value.sdcpn || revisionId === undefined;
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
 * Adds a new net to `storage` and returns it. Unlike the editor's own writes,
 * this one throws when the browser refuses it, so a caller never links to a
 * net that was not kept.
 */
export const saveNetInStorage = (
  storage: Storage,
  params: { petriNetDefinition: SDCPN; title: string },
): SDCPNInLocalStorage => {
  const net = createLocalStorageNetRecord(params);
  const raw = readRawStore(storage);
  storage.setItem(
    rootLocalStorageKey,
    serializeStore({ ...readStore(storage), [net.id]: net }, raw),
  );
  return net;
};

/** Adds an empty net to `storage` and returns it. */
export const startEmptyNetInStorage = (storage: Storage): SDCPNInLocalStorage =>
  saveNetInStorage(storage, {
    petriNetDefinition: emptySDCPN,
    title: "New Process",
  });

/**
 * The most recently edited net in `storage`, or a new empty one when it holds
 * none.
 */
export const latestOrNewNetInStorage = (
  storage: Storage,
): SDCPNInLocalStorage =>
  Object.values(readStore(storage)).toSorted(
    (left, right) =>
      new Date(right.lastUpdated).getTime() -
      new Date(left.lastUpdated).getTime(),
  )[0] ?? startEmptyNetInStorage(storage);

export const useLocalStorageSDCPNs = () => {
  const [storedSDCPNs, setStoredSDCPNs, ready] = usePersistedState({
    fallback: noStoredSDCPNs,
    read: readStoredSDCPNs,
    storageKey: rootLocalStorageKey,
    write: writeStoredSDCPNs,
  });

  return { ready, storedSDCPNs, setStoredSDCPNs };
};
