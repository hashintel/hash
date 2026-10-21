/**
 * One native TypeScript program over every covered file, held in a
 * snapshot that an edit updates in place. Symbol resolution needs module
 * resolution, JSX and the DOM and Node libraries; type errors are
 * irrelevant, so the packages' own strictness settings are not needed.
 */

import { join, relative } from "node:path";

import {
  API,
  JsxEmit,
  ModuleKind,
  ModuleResolutionKind,
  type Checker,
  type Program,
  type RawCompilerOptions,
  type Snapshot,
} from "typescript-7/sync";

import { toPosix } from "../../../shared/paths";

import type { SourceFile } from "typescript-7/ast";

export interface ProgramHost {
  program: () => Program;
  checker: () => Checker;
  /** The parsed file for a repo-relative path, when the program holds it. */
  sourceFile: (file: string) => SourceFile | undefined;
  /** A path the program reports, absolute or canonical, as repo-relative. */
  repoRelative: (path: string) => string;
  /** The program after `changed` changed on disk, over the files given. */
  update: (files: string[], changed: string[]) => void;
  dispose: () => void;
}

const compilerOptions = (
  paths: Record<string, string[]>,
): RawCompilerOptions => ({
  module: ModuleKind.ESNext,
  moduleResolution: ModuleResolutionKind.Bundler,
  jsx: JsxEmit.ReactJSX,
  lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  types: ["node"],
  resolveJsonModule: true,
  allowImportingTsExtensions: true,
  paths,
  noEmit: true,
  skipLibCheck: true,
});

export const createProgramHost = (options: {
  repoRoot: string;
  paths: Record<string, string[]>;
  /** Repo-relative. */
  files: string[];
}): ProgramHost => {
  const { repoRoot } = options;
  const absolute = (file: string): string => join(repoRoot, file);
  const api = new API({ cwd: repoRoot });
  const settings = compilerOptions(options.paths);

  let snapshot: Snapshot = api.createSnapshot({
    createPrograms: [
      { rootFiles: options.files.map(absolute), compilerOptions: settings },
    ],
  });
  const [created] = snapshot.operation.createdPrograms ?? [];
  if (created === undefined) {
    throw new Error("the TypeScript API created no program");
  }
  const programId = created.id;
  let program = created;
  // Paths the API reports are canonical, lowercase on this file system;
  // the program's own file list restores the spelling the model uses.
  let spelling = new Map<string, string>();
  const refreshSpelling = (): void => {
    spelling = new Map(
      program
        .getSourceFileNames()
        .map((name) => [String(name).toLowerCase(), String(name)]),
    );
  };
  refreshSpelling();

  return {
    program: () => program,
    checker: () => {
      const project = snapshot.getProject(programId);
      if (project === undefined) {
        throw new Error("the TypeScript program's project is gone");
      }
      return project.checker;
    },
    sourceFile: (file) => program.getSourceFile(absolute(file)),
    repoRelative: (path) => {
      const spelled = spelling.get(String(path).toLowerCase()) ?? String(path);
      return toPosix(relative(repoRoot, spelled));
    },
    update: (files, changed) => {
      const previous = snapshot;
      snapshot = snapshot.update({
        fileNotifications: { changed: changed.map(absolute) },
        reconfigurePrograms: [
          {
            id: programId,
            rootFiles: files.map(absolute),
            compilerOptions: settings,
          },
        ],
      });
      previous.dispose();
      const updated = snapshot.getProgram(programId);
      if (updated === undefined) {
        throw new Error("the TypeScript program did not survive the update");
      }
      program = updated;
      refreshSpelling();
    },
    dispose: () => {
      snapshot.dispose();
    },
  };
};
