/**
 * The worker that owns the native program. It answers `index` with every
 * file's facts and `update` with the facts after an edit, re-walking the
 * edited files and every file referencing a symbol they define. The main
 * thread never waits on the compiler, so a server beside it keeps serving.
 */

import { workerData } from "node:worker_threads";

import { serveWorker } from "../../../shared/worker-channel";
import { createProgramHost } from "./program-host";
import { createProgramWalker } from "./walk-program";
import { createSyntacticWalker } from "./walk-syntactic";

import type { Analysis, IndexedDocument } from "../../facts";

export interface TypeScriptWorkerData {
  repoRoot: string;
  paths: Record<string, string[]>;
  analysis: Analysis;
}

export type TypeScriptRequest =
  | { type: "index"; files: string[] }
  | { type: "update"; files: string[]; changed: string[] };

export interface TypeScriptResponse {
  documents: IndexedDocument[];
  /** How many files were walked to answer. */
  walked: number;
}

const data = workerData as TypeScriptWorkerData;
const documents = new Map<string, IndexedDocument>();
let host: ReturnType<typeof createProgramHost> | null = null;

/** Files holding a reference to a symbol one of `changed` defines. */
const dependentsOf = (changed: string[]): string[] => {
  const prefixes = changed.map((file) => `${file}#`);
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

const walkerFor = (programHost: ReturnType<typeof createProgramHost>) => {
  if (data.analysis === "program") {
    const walker = createProgramWalker(programHost);
    return {
      walk: (files: string[]) => files.map((file) => walker.walk(file)),
      reset: walker.reset,
    };
  }
  const walker = createSyntacticWalker(programHost);
  return {
    walk: (files: string[]) => {
      for (const file of files) {
        walker.refresh(file);
      }
      return walker.documents(files);
    },
    reset: walker.reset,
  };
};
let walker: ReturnType<typeof walkerFor> | null = null;

const respond = (walked: number): TypeScriptResponse => ({
  documents: [...documents.values()],
  walked,
});

serveWorker<TypeScriptRequest, TypeScriptResponse>((request) => {
  if (request.type === "index" || host === null || walker === null) {
    host?.dispose();
    host = createProgramHost({
      repoRoot: data.repoRoot,
      paths: data.paths,
      files: request.files,
    });
    walker = walkerFor(host);
    documents.clear();
    for (const document of walker.walk(request.files)) {
      documents.set(document.file, document);
    }
    return respond(request.files.length);
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
  for (const document of walker.walk(stale)) {
    documents.set(document.file, document);
  }
  return respond(stale.length);
});
