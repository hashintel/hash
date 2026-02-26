import * as ts from "typescript";
import libEs5 from "typescript/lib/lib.es5.d.ts?raw";
import libEs2015Core from "typescript/lib/lib.es2015.core.d.ts?raw";
import libEs2015Iterable from "typescript/lib/lib.es2015.iterable.d.ts?raw";
import libEs2015Symbol from "typescript/lib/lib.es2015.symbol.d.ts?raw";

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

/** Virtual file entry with optional prefix (for injected declarations) */
export type VirtualFile = {
  prefix?: string;
  content: string;
};

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
      return (entry.prefix ?? "") + entry.content;
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
    files.set(fileName, file);
    versions.set(fileName, 0);
  };

  const removeFile = (fileName: string) => {
    files.delete(fileName);
    versions.delete(fileName);
  };

  const updateFile = (fileName: string, file: VirtualFile) => {
    files.set(fileName, file);
    bumpVersion(fileName);
  };

  const updateContent = (fileName: string, content: string) => {
    const entry = files.get(fileName);
    if (entry) {
      entry.content = content;
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
