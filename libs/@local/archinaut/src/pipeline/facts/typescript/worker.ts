/**
 * The worker that owns the native program. It answers `index` with every
 * file's facts and `update` with the facts after an edit, re-walking the
 * edited files and every file referencing a symbol they define. The main
 * thread never waits on the compiler, so a server beside it keeps serving.
 */

import { serveWorker, workerInput } from "../../../shared/worker-channel";
import { moduleSymbol } from "../shared/symbols";
import { createProgramHost } from "./program-host";
import { createProgramWalker } from "./walk-program";

import type { IndexedDocument } from "../../facts";

export interface TypeScriptWorkerData {
  repoRoot: string;
  paths: Record<string, string[]>;
}

export type TypeScriptRequest =
  | { type: "index"; files: string[] }
  | { type: "update"; files: string[]; changed: string[] };

export interface TypeScriptResponse {
  documents: IndexedDocument[];
}

const data = workerInput<TypeScriptWorkerData>();
const documents = new Map<string, IndexedDocument>();
let host: ReturnType<typeof createProgramHost> | null = null;
let walker: ReturnType<typeof createProgramWalker> | null = null;

/** Files holding a reference to a symbol one of `changed` defines. */
const dependentsOf = (changed: string[]): string[] => {
  const prefixes = changed.map(moduleSymbol);
  return [...documents.values()]
    .filter(
      (document) =>
        !changed.includes(document.file) &&
        document.occurrences.some((occurrence) =>
          prefixes.some((prefix) => occurrence.symbol.startsWith(prefix)),
        ),
    )
    .map((document) => document.file);
};

const respond = (): TypeScriptResponse => ({
  documents: [...documents.values()],
});

serveWorker<TypeScriptRequest, TypeScriptResponse>((request) => {
  if (request.type === "index" || host === null || walker === null) {
    host?.dispose();
    host = createProgramHost({
      repoRoot: data.repoRoot,
      paths: data.paths,
      files: request.files,
    });
    walker = createProgramWalker(host);
    documents.clear();
    for (const file of request.files) {
      documents.set(file, walker.walk(file));
    }
    return respond();
  }
  const present = new Set(request.files);
  for (const file of documents.keys()) {
    if (!present.has(file)) {
      documents.delete(file);
    }
  }
  host.update(request.files, request.changed);
  walker.reset();
  const stale = [
    ...request.changed.filter((file) => present.has(file)),
    ...dependentsOf(request.changed),
  ];
  for (const file of stale) {
    documents.set(file, walker.walk(file));
  }
  return respond();
});
