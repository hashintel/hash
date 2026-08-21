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
} from "@brunch/core";
import {
  archiveSessionLogRead,
  createEmptySessionLogArchive,
  parseSessionLogArchive,
  readArchivedEntryRange,
  type SessionLogArchive,
  type SessionLogRead,
} from "@brunch/core/storage";

import { registerArchiveWriter } from "./archive-capability.ts";

const FORMAT_VERSION = 1 as const;

interface TargetDocumentRecord {
  readonly formatVersion: typeof FORMAT_VERSION;
  readonly captureStore: CaptureStoreSnapshot;
  readonly sessionLogArchive: SessionLogArchive;
}

const writesByPath = new Map<string, Promise<void>>();

const createEmptyTargetDocument = (): TargetDocumentRecord => ({
  formatVersion: FORMAT_VERSION,
  captureStore: createEmptyCaptureStoreSnapshot(),
  sessionLogArchive: createEmptySessionLogArchive(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseTargetDocument = (input: unknown): TargetDocumentRecord => {
  if (isRecord(input) && "formatVersion" in input) {
    const fields = Object.keys(input).sort();
    if (
      input.formatVersion !== FORMAT_VERSION ||
      JSON.stringify(fields) !==
        JSON.stringify(["captureStore", "formatVersion", "sessionLogArchive"])
    ) {
      throw new TypeError(
        `Unsupported target-document format version ${String(input.formatVersion)}.`,
      );
    }
    return {
      formatVersion: FORMAT_VERSION,
      captureStore: parseCaptureStoreSnapshot(input.captureStore),
      sessionLogArchive: parseSessionLogArchive(input.sessionLogArchive),
    };
  }

  // FE-1390 files predate the archive slot. Reading that exact capture-store
  // shape provisions the new record in memory; the next successful mutation
  // rewrites it atomically in the current format.
  return {
    formatVersion: FORMAT_VERSION,
    captureStore: parseCaptureStoreSnapshot(input),
    sessionLogArchive: createEmptySessionLogArchive(),
  };
};

class LocalCaptureStore implements CaptureStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = resolve(path);
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
      return parseTargetDocument(
        JSON.parse(await readFile(this.#path, "utf8")),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return createEmptyTargetDocument();
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

export const createLocalCaptureStore = (path: string): CaptureStore =>
  new LocalCaptureStore(path);
