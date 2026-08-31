import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  applyCaptureStoreCommand,
  createEmptyCaptureStoreSnapshot,
  parseCaptureStoreSnapshot,
  type ArchivedSessionEntry,
  type CaptureStore,
  type CaptureStoreCommand,
  type CaptureStoreEvidenceContext,
  type CaptureStoreResult,
  type CaptureStoreSnapshot,
  type EvidenceSpan,
} from "@hashintel/brunch-agent";
import {
  archiveSessionLogRead,
  createEmptySessionLogArchive,
  parseSessionLogArchive,
  readArchivedEntryRange,
  type SessionLogArchive,
  type SessionLogRead,
} from "@hashintel/brunch-agent/storage";

import { registerArchiveWriter } from "./archive-capability";

const FORMAT_VERSION = 2 as const;
const LEGACY_FORMAT_VERSION = 1 as const;

interface TargetDocumentRecord {
  readonly formatVersion: typeof FORMAT_VERSION;
  readonly ownerKey: string | null;
  readonly captureStore: CaptureStoreSnapshot;
  readonly sessionLogArchive: SessionLogArchive;
}

const writesByPath = new Map<string, Promise<void>>();

const createEmptyTargetDocument = (
  ownerKey: string | null,
): TargetDocumentRecord => ({
  formatVersion: FORMAT_VERSION,
  ownerKey,
  captureStore: createEmptyCaptureStoreSnapshot(),
  sessionLogArchive: createEmptySessionLogArchive(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseTargetDocument = (input: unknown): TargetDocumentRecord => {
  if (isRecord(input) && "formatVersion" in input) {
    const fields = Object.keys(input).sort();
    if (input.formatVersion === FORMAT_VERSION) {
      if (
        JSON.stringify(fields) !==
          JSON.stringify([
            "captureStore",
            "formatVersion",
            "ownerKey",
            "sessionLogArchive",
          ]) ||
        (typeof input.ownerKey !== "string" && input.ownerKey !== null)
      ) {
        throw new TypeError("Invalid target-document ownership record.");
      }
      return {
        formatVersion: FORMAT_VERSION,
        ownerKey: input.ownerKey,
        captureStore: parseCaptureStoreSnapshot(input.captureStore),
        sessionLogArchive: parseSessionLogArchive(input.sessionLogArchive),
      };
    }
    if (
      input.formatVersion === LEGACY_FORMAT_VERSION &&
      JSON.stringify(fields) ===
        JSON.stringify(["captureStore", "formatVersion", "sessionLogArchive"])
    ) {
      return {
        formatVersion: FORMAT_VERSION,
        ownerKey: null,
        captureStore: parseCaptureStoreSnapshot(input.captureStore),
        sessionLogArchive: parseSessionLogArchive(input.sessionLogArchive),
      };
    }
    throw new TypeError(
      `Unsupported target-document format version ${String(input.formatVersion)}.`,
    );
  }

  // FE-1390 files predate the archive slot. Reading that exact capture-store
  // shape provisions the new record in memory; the next successful mutation
  // rewrites it atomically in the current format.
  return {
    formatVersion: FORMAT_VERSION,
    ownerKey: null,
    captureStore: parseCaptureStoreSnapshot(input),
    sessionLogArchive: createEmptySessionLogArchive(),
  };
};

class TargetDocumentOwnerMismatchError extends Error {
  readonly code = "target-document-owner-mismatch";

  constructor() {
    super("The target document is owned by a different principal.");
    this.name = "TargetDocumentOwnerMismatchError";
  }
}

class LocalCaptureStore implements CaptureStore {
  readonly #ownerKey: string | null;
  readonly #path: string;

  constructor(path: string, ownerKey: string | null) {
    this.#path = resolve(path);
    this.#ownerKey = ownerKey;
    registerArchiveWriter(this, (read) => this.#archiveSessionLog(read));
  }

  async read(): Promise<CaptureStoreSnapshot> {
    await writesByPath.get(this.#path);
    return (await this.#readFile()).captureStore;
  }

  async execute(
    command: CaptureStoreCommand,
    context?: CaptureStoreEvidenceContext,
  ): Promise<CaptureStoreResult> {
    return this.#mutate<CaptureStoreResult>((document) => {
      const evidenceContext = context
        ? { ...context, archive: document.sessionLogArchive }
        : undefined;
      const result = applyCaptureStoreCommand(
        document.captureStore,
        command,
        evidenceContext,
      );
      return result.ok
        ? {
            value: result,
            document: { ...document, captureStore: result.snapshot },
          }
        : { value: result };
    });
  }

  async #archiveSessionLog(read: SessionLogRead): Promise<void> {
    await this.#mutate((document) => ({
      value: undefined,
      document: {
        ...document,
        sessionLogArchive: archiveSessionLogRead(
          document.sessionLogArchive,
          read,
        ),
      },
    }));
  }

  async readArchivedEntries(
    pointer: EvidenceSpan["pointer"],
  ): Promise<readonly ArchivedSessionEntry[]> {
    await writesByPath.get(this.#path);
    return readArchivedEntryRange(
      (await this.#readFile()).sessionLogArchive,
      pointer,
    );
  }

  async #mutate<T>(
    mutation: (document: TargetDocumentRecord) => {
      readonly value: T;
      readonly document?: TargetDocumentRecord;
    },
  ): Promise<T> {
    const previous = writesByPath.get(this.#path) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const before = await this.#readFile();
      const outcome = mutation(before);
      if (
        outcome.document &&
        JSON.stringify(outcome.document) !== JSON.stringify(before)
      ) {
        await this.#writeFile(outcome.document);
      }
      return outcome.value;
    });
    const settled = operation.then(
      () => undefined,
      () => undefined,
    );
    writesByPath.set(this.#path, settled);
    void settled.finally(() => {
      if (writesByPath.get(this.#path) === settled)
        writesByPath.delete(this.#path);
    });
    return operation;
  }

  async #readFile(): Promise<TargetDocumentRecord> {
    try {
      const document = parseTargetDocument(
        JSON.parse(await readFile(this.#path, "utf8")),
      );
      if (document.ownerKey !== this.#ownerKey) {
        throw new TargetDocumentOwnerMismatchError();
      }
      return document;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return createEmptyTargetDocument(this.#ownerKey);
      }
      throw error;
    }
  }

  async #writeFile(document: TargetDocumentRecord): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    const temporaryPath = `${this.#path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      await rename(temporaryPath, this.#path);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}

export const createLocalCaptureStore = (
  path: string,
  options: { readonly ownerKey?: string } = {},
): CaptureStore => {
  if (options.ownerKey !== undefined && options.ownerKey.length === 0) {
    throw new TypeError("A target-document owner key cannot be empty.");
  }
  return new LocalCaptureStore(path, options.ownerKey ?? null);
};
