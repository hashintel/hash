import * as ts from "typescript";

import type { SDCPN } from "../types/sdcpn";

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  strict: true,
};

/**
 * Creates a TypeScript language service for the given SDCPN code.
 * @param sdcpn The SDCPN object containing the code to be checked.
 * @returns A TypeScript LanguageService instance.
 */
export function createSDCPNLanguageService(sdcpn: SDCPN): ts.LanguageService {
  // Build a map of all file contents with optional prefixes
  const fileContents = new Map<string, { prefix: string; content: string }>();

  for (const de of sdcpn.differentialEquations) {
    // Declaration file (no prefix needed)
    fileContents.set(`differential_equations/${de.id}/defs.d.ts`, {
      prefix: "",
      content: `declare const tokens: { a: 42, b: boolean };`,
    });

    // Code file with triple-slash reference to defs
    fileContents.set(`differential_equations/${de.id}/code.ts`, {
      prefix: `/// <reference path="defs.d.ts" />\n`,
      content: de.code,
    });
  }

  const getFileEntry = (
    fileName: string,
  ): { prefix: string; content: string } | undefined => {
    return fileContents.get(fileName);
  };

  // Base Language Service
  const baseLanguageService = ts.createLanguageService({
    getScriptFileNames() {
      return [...fileContents.keys()];
    },
    getCompilationSettings() {
      return compilerOptions;
    },
    getScriptSnapshot(fileName: string) {
      const entry = getFileEntry(fileName);
      if (entry !== undefined) {
        return ts.ScriptSnapshot.fromString(entry.prefix + entry.content);
      }
      return undefined;
    },
    fileExists(path: string) {
      return fileContents.has(path);
    },
    readFile(path: string) {
      const entry = getFileEntry(path);
      if (entry !== undefined) {
        return entry.prefix + entry.content;
      }
      return undefined;
    },
    getCurrentDirectory() {
      return "";
    },
    getDefaultLibFileName(options: ts.CompilerOptions) {
      return ts.getDefaultLibFilePath(options);
    },
    getScriptVersion() {
      return "0";
    },
  });

  // Augmented Language Service
  const augmentedLanguageService: ts.LanguageService = {
    ...baseLanguageService,
    getSemanticDiagnostics(fileName: string): ts.Diagnostic[] {
      console.log("Running semantic diagnostics for SDCPN:", sdcpn);
      return baseLanguageService.getSemanticDiagnostics(fileName);
    },
    getCompletionsAtPosition(
      fileName: string,
      position: number,
      options: ts.GetCompletionsAtPositionOptions | undefined,
    ): ts.CompletionInfo | undefined {
      const entry = getFileEntry(fileName);
      const prefixLength = entry?.prefix.length ?? 0;
      console.log(
        `Getting completions at position ${position} in file ${fileName}`,
      );
      return baseLanguageService.getCompletionsAtPosition(
        fileName,
        position + prefixLength,
        options,
      );
    },
  };

  return augmentedLanguageService;
}
