/**
 * Mutable Language Service Host for the LSP worker.
 *
 * Extends the base language service host to support:
 * - File content updates with version tracking (for TS incremental compilation)
 * - File removal for cleanup
 */

import * as ts from "typescript";
import libEs5 from "typescript/lib/lib.es5.d.ts?raw";
import libEs2015Core from "typescript/lib/lib.es2015.core.d.ts?raw";
import libEs2015Iterable from "typescript/lib/lib.es2015.iterable.d.ts?raw";
import libEs2015Symbol from "typescript/lib/lib.es2015.symbol.d.ts?raw";

import type { VirtualFile } from "../core/checker/create-language-service-host";

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

/** Virtual file with version tracking for incremental compilation */
export type MutableVirtualFile = VirtualFile & {
  version: number;
};

/**
 * Extended LanguageServiceHost with mutation support.
 */
export interface MutableLanguageServiceHost extends ts.LanguageServiceHost {
  /**
   * Updates a file's content and increments its version.
   * Creates the file if it doesn't exist.
   */
  updateFile(fileName: string, content: string): void;

  /**
   * Gets the current version of a file.
   */
  getFileVersion(fileName: string): number;

  /**
   * Removes a file from the virtual filesystem.
   */
  removeFile(fileName: string): void;

  /**
   * Gets the prefix length for a file (used for position adjustment).
   */
  getPrefixLength(fileName: string): number;

  /**
   * Gets the full content of a file (prefix + user content).
   */
  getFullContent(fileName: string): string | undefined;
}

/**
 * Creates a mutable TypeScript LanguageServiceHost for LSP worker use.
 *
 * Unlike the static host used for one-shot validation, this host supports
 * updating file contents and tracking versions for incremental compilation.
 *
 * @param initialFiles - Initial virtual file map from generateVirtualFiles
 * @returns MutableLanguageServiceHost with update capabilities
 */
export function createMutableLanguageServiceHost(
  initialFiles: Map<string, VirtualFile>,
): MutableLanguageServiceHost {
  // Convert to mutable files with version tracking
  const files = new Map<string, MutableVirtualFile>(
    [...initialFiles].map(([key, value]) => [key, { ...value, version: 0 }]),
  );

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

  return {
    // Standard LanguageServiceHost methods
    getScriptFileNames: () => [...files.keys()],
    getCompilationSettings: () => COMPILER_OPTIONS,
    getScriptVersion: (fileName: string) =>
      files.get(fileName)?.version.toString() ?? "0",
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

    // Mutable extensions
    updateFile(fileName: string, content: string) {
      const existing = files.get(fileName);
      if (existing) {
        existing.content = content;
        existing.version++;
      } else {
        // Create new file without prefix (user-created files)
        files.set(fileName, { content, version: 0 });
      }
    },

    getFileVersion(fileName: string): number {
      return files.get(fileName)?.version ?? 0;
    },

    removeFile(fileName: string) {
      files.delete(fileName);
    },

    getPrefixLength(fileName: string): number {
      const entry = files.get(fileName);
      return entry?.prefix?.length ?? 0;
    },

    getFullContent(fileName: string): string | undefined {
      return getFileContent(fileName);
    },
  };
}
