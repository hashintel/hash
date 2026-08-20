import {
  applyCaptureStoreCommand,
  createEmptyCaptureStoreSnapshot,
  parseCaptureStoreSnapshot,
  type CaptureStore,
  type CaptureStoreCommand,
  type CaptureStoreResult,
  type CaptureStoreSnapshot,
} from '@brunch/core';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const writesByPath = new Map<string, Promise<void>>();

class LocalCaptureStore implements CaptureStore {
  readonly #path: string;

  constructor(path: string) {
    this.#path = resolve(path);
  }

  async read(): Promise<CaptureStoreSnapshot> {
    await writesByPath.get(this.#path);
    return this.#readFile();
  }

  async execute(command: CaptureStoreCommand): Promise<CaptureStoreResult> {
    const previous = writesByPath.get(this.#path) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const result = applyCaptureStoreCommand(await this.#readFile(), command);
      if (result.ok) await this.#writeFile(result.snapshot);
      return result;
    });
    const settled = operation.then(
      () => undefined,
      () => undefined,
    );
    writesByPath.set(this.#path, settled);
    void settled.finally(() => {
      if (writesByPath.get(this.#path) === settled) writesByPath.delete(this.#path);
    });
    return operation;
  }

  async #readFile(): Promise<CaptureStoreSnapshot> {
    try {
      return parseCaptureStoreSnapshot(JSON.parse(await readFile(this.#path, 'utf8')));
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return createEmptyCaptureStoreSnapshot();
      }
      throw error;
    }
  }

  async #writeFile(snapshot: CaptureStoreSnapshot): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    const temporaryPath = `${this.#path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      await rename(temporaryPath, this.#path);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}

export const createLocalCaptureStore = (path: string): CaptureStore => new LocalCaptureStore(path);
