import ts from "typescript";

import type { SDCPN } from "../../core/types/sdcpn";
import {
  createLanguageServiceHost,
  type LanguageServiceHostController,
  type VirtualFile,
} from "./create-language-service-host";
import { generateVirtualFiles } from "./generate-virtual-files";

/**
 * Adjusts diagnostic positions to account for injected prefix
 */
function adjustDiagnostics<T extends ts.Diagnostic>(
  diagnostics: readonly T[],
  prefixLength: number,
): T[] {
  return diagnostics.map((diag) => ({
    ...diag,
    start: diag.start !== undefined ? diag.start - prefixLength : undefined,
  }));
}

/**
 * Persistent TypeScript language server for SDCPN code validation.
 *
 * Creates the `ts.LanguageService` once and reuses it across SDCPN changes
 * by diffing virtual files (add/remove/update) rather than recreating everything.
 */
export class SDCPNLanguageServer {
  private files: Map<string, VirtualFile>;
  private controller: LanguageServiceHostController;
  private service: ts.LanguageService;

  constructor() {
    this.files = new Map();
    this.controller = createLanguageServiceHost(this.files);
    this.service = ts.createLanguageService(this.controller.host);
  }

  /**
   * Sync virtual files to match the given SDCPN model.
   * Diffs against the current state: adds new files, updates changed files,
   * removes files that no longer exist.
   */
  syncFiles(sdcpn: SDCPN): void {
    const newFiles = generateVirtualFiles(sdcpn);

    // Remove files that no longer exist
    for (const existingName of this.controller.getFileNames()) {
      if (!newFiles.has(existingName)) {
        this.controller.removeFile(existingName);
      }
    }

    // Add or update files
    for (const [name, newFile] of newFiles) {
      if (!this.controller.hasFile(name)) {
        this.controller.addFile(name, newFile);
      } else {
        const existing = this.controller.getFile(name)!;
        if (
          existing.content !== newFile.content ||
          existing.prefix !== newFile.prefix
        ) {
          this.controller.updateFile(name, newFile);
        }
      }
    }
  }

  /** Update only the user content of a single file (e.g., when the user types in an editor). */
  updateDocumentContent(fileName: string, content: string): void {
    this.controller.updateContent(fileName, content);
  }

  /** Get the full text content (prefix + user content) of a virtual file. */
  getFileContent(fileName: string): string | undefined {
    const file = this.controller.getFile(fileName);
    if (!file) {
      return undefined;
    }
    return (file.prefix ?? "") + file.content;
  }

  /** Get only the user-visible content of a virtual file (without the injected prefix). */
  getUserContent(fileName: string): string | undefined {
    return this.controller.getFile(fileName)?.content;
  }

  getSemanticDiagnostics(fileName: string): ts.Diagnostic[] {
    const entry = this.controller.getFile(fileName);
    const prefixLength = entry?.prefix?.length ?? 0;
    const diagnostics = this.service.getSemanticDiagnostics(fileName);
    return adjustDiagnostics(diagnostics, prefixLength);
  }

  getSyntacticDiagnostics(fileName: string): ts.Diagnostic[] {
    const entry = this.controller.getFile(fileName);
    const prefixLength = entry?.prefix?.length ?? 0;
    const diagnostics = this.service.getSyntacticDiagnostics(fileName);
    return adjustDiagnostics(diagnostics, prefixLength);
  }

  getCompletionsAtPosition(
    fileName: string,
    position: number,
    options: ts.GetCompletionsAtPositionOptions | undefined,
  ): ts.CompletionInfo | undefined {
    const entry = this.controller.getFile(fileName);
    const prefixLength = entry?.prefix?.length ?? 0;
    return this.service.getCompletionsAtPosition(
      fileName,
      position + prefixLength,
      options,
    );
  }

  getQuickInfoAtPosition(
    fileName: string,
    position: number,
  ): ts.QuickInfo | undefined {
    const entry = this.controller.getFile(fileName);
    const prefixLength = entry?.prefix?.length ?? 0;
    const info = this.service.getQuickInfoAtPosition(
      fileName,
      position + prefixLength,
    );
    if (!info) {
      return undefined;
    }
    return {
      ...info,
      textSpan: {
        start: info.textSpan.start - prefixLength,
        length: info.textSpan.length,
      },
    };
  }

  getSignatureHelpItems(
    fileName: string,
    position: number,
    options: ts.SignatureHelpItemsOptions | undefined,
  ): ts.SignatureHelpItems | undefined {
    const entry = this.controller.getFile(fileName);
    const prefixLength = entry?.prefix?.length ?? 0;
    return this.service.getSignatureHelpItems(
      fileName,
      position + prefixLength,
      options,
    );
  }

  dispose(): void {
    this.service.dispose();
  }
}
