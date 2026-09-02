import * as ts from "typescript";
import libEs5 from "typescript/lib/lib.es5.d.ts?raw";
import libEs2015Core from "typescript/lib/lib.es2015.core.d.ts?raw";
import libEs2015Iterable from "typescript/lib/lib.es2015.iterable.d.ts?raw";
import libEs2015Symbol from "typescript/lib/lib.es2015.symbol.d.ts?raw";

import { detectUserCodeForm } from "../../hir";

/** Bundled TypeScript lib files (with absolute paths) */
const BUNDLED_LIBS: Record<string, string> = {
  "/lib.es5.d.ts": libEs5,
  "/lib.es2015.core.d.ts": libEs2015Core,
  "/lib.es2015.symbol.d.ts": libEs2015Symbol,
  "/lib.es2015.iterable.d.ts": libEs2015Iterable,
};

/** TypeScript compiler options for SDCPN code checking */
const COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2015,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  strict: true,
  lib: [
    "lib.es5.d.ts",
    "lib.es2015.core.d.ts",
    "lib.es2015.symbol.d.ts",
    "lib.es2015.iterable.d.ts",
  ],
  // Use root as base URL for absolute imports
  baseUrl: "/",
  // Disable automatic type resolution to avoid Node.js-specific APIs in browser
  typeRoots: [],
  types: [],
};

/** Injected text around the user content of a virtual file. */
export type VirtualFileWrapper = {
  prefix: string;
  suffix: string;
};

/** Virtual file entry with optional prefix/suffix (for injected declarations and expression wrapping) */
export type VirtualFile = {
  prefix?: string;
  content: string;
  suffix?: string;
  /**
   * Wrappers per user-code form for files that accept both authoring forms
   * (dynamics/lambda/kernel code). When set, `prefix`/`suffix` are re-derived
   * from the current content's detected form on every write, so the file
   * type-checks as an `export default <Ctor>(...)` module or as a bare
   * function body depending on what the user wrote.
   */
  formWrappers?: {
    module: VirtualFileWrapper;
    body: VirtualFileWrapper;
  };
};

/** Structural equality over every field that affects type checking, used to
 * skip no-op updates when re-syncing virtual files. */
export function virtualFileEquals(a: VirtualFile, b: VirtualFile): boolean {
  return (
    a.content === b.content &&
    a.prefix === b.prefix &&
    a.suffix === b.suffix &&
    a.formWrappers?.module.prefix === b.formWrappers?.module.prefix &&
    a.formWrappers?.module.suffix === b.formWrappers?.module.suffix &&
    a.formWrappers?.body.prefix === b.formWrappers?.body.prefix &&
    a.formWrappers?.body.suffix === b.formWrappers?.body.suffix
  );
}

/**
 * Returns the entry with the wrapper matching the content's detected form
 * applied. Files without `formWrappers` are returned unchanged.
 */
export function applyFormWrapper(file: VirtualFile): VirtualFile {
  if (!file.formWrappers) {
    return file;
  }
  const wrapper = file.formWrappers[detectUserCodeForm(file.content)];
  return { ...file, prefix: wrapper.prefix, suffix: wrapper.suffix };
}

/** Controller for the virtual file system backing the LanguageServiceHost. */
export type LanguageServiceHostController = {
  host: ts.LanguageServiceHost;
  /** Add a new file to the virtual file system. */
  addFile: (fileName: string, file: VirtualFile) => void;
  /** Remove a file from the virtual file system. */
  removeFile: (fileName: string) => void;
  /** Replace an entire file entry (prefix + content) and bump its version. */
  updateFile: (fileName: string, file: VirtualFile) => void;
  /** Update only the user content of an existing file (preserves prefix). */
  updateContent: (fileName: string, content: string) => void;
  /** Check whether a file exists in the virtual file system. */
  hasFile: (fileName: string) => boolean;
  /** Return all file names currently in the virtual file system. */
  getFileNames: () => string[];
  /** Get the VirtualFile entry for a given file name. */
  getFile: (fileName: string) => VirtualFile | undefined;
};

/**
 * Creates a TypeScript LanguageServiceHost backed by a virtual file system.
 *
 * The returned controller allows incremental mutations (add/remove/update)
 * without recreating the host or the LanguageService that consumes it.
 */
export function createLanguageServiceHost(
  files: Map<string, VirtualFile>,
): LanguageServiceHostController {
  const versions = new Map<string, number>();

  const getFileContent = (fileName: string): string | undefined => {
    const entry = files.get(fileName);
    if (entry) {
      return (entry.prefix ?? "") + entry.content + (entry.suffix ?? "");
    }
    // Check bundled lib files (try both absolute path and just filename)
    if (BUNDLED_LIBS[fileName]) {
      return BUNDLED_LIBS[fileName];
    }
    // Fallback: extract lib filename and try with absolute path
    const libName = fileName.split("/").pop();
    if (libName) {
      return BUNDLED_LIBS[`/${libName}`];
    }
    return undefined;
  };

  const bumpVersion = (fileName: string) => {
    versions.set(fileName, (versions.get(fileName) ?? 0) + 1);
  };

  const addFile = (fileName: string, file: VirtualFile) => {
    files.set(fileName, applyFormWrapper(file));
    versions.set(fileName, 0);
  };

  const removeFile = (fileName: string) => {
    files.delete(fileName);
    versions.delete(fileName);
  };

  const updateFile = (fileName: string, file: VirtualFile) => {
    files.set(fileName, applyFormWrapper(file));
    bumpVersion(fileName);
  };

  const updateContent = (fileName: string, content: string) => {
    const entry = files.get(fileName);
    if (entry) {
      files.set(fileName, applyFormWrapper({ ...entry, content }));
      bumpVersion(fileName);
    }
  };

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => [...files.keys()],
    getCompilationSettings: () => COMPILER_OPTIONS,
    getScriptVersion: (fileName) => String(versions.get(fileName) ?? 0),
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "/lib.es2015.core.d.ts",

    getScriptSnapshot(fileName: string) {
      const content = getFileContent(fileName);
      return content ? ts.ScriptSnapshot.fromString(content) : undefined;
    },

    fileExists(path: string) {
      return getFileContent(path) !== undefined;
    },

    readFile(path: string) {
      return getFileContent(path);
    },
  };

  return {
    host,
    addFile,
    removeFile,
    updateFile,
    updateContent,
    hasFile: (fileName) => files.has(fileName),
    getFileNames: () => [...files.keys()],
    getFile: (fileName) => files.get(fileName),
  };
}
