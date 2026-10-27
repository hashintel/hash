import ts from "@typescript/typescript6";

import {
  createLanguageServiceHost,
  virtualFileEquals,
  type LanguageServiceHostConfig,
  type LanguageServiceHostController,
  type VirtualFile,
} from "./create-language-service-host";

/**
 * Adjusts diagnostic positions to account for injected prefix and suffix.
 * Diagnostics in the suffix area are clamped to the end of user content.
 * Diagnostics in the prefix keep their (negative) adjusted offset: some are
 * load-bearing with no user-side twin — the scenario/metric wrappers rely on
 * TS2355 ("must return a value"), reported on the wrapper signature, to flag
 * a body that never returns — and editors clamp negative offsets to the
 * start of the document.
 */
function adjustDiagnostics<T extends ts.Diagnostic>(
  diagnostics: readonly T[],
  prefixLength: number,
  contentLength?: number,
): T[] {
  return diagnostics.map((diag) => {
    let start =
      diag.start !== undefined ? diag.start - prefixLength : undefined;
    let { length } = diag;

    if (start !== undefined && contentLength !== undefined) {
      if (start >= contentLength) {
        // Diagnostic is in suffix area — clamp to end of content
        start = Math.max(0, contentLength > 0 ? contentLength - 1 : 0);
        length = contentLength > 0 ? 1 : 0;
      }
    }

    return { ...diag, start, length };
  });
}

/**
 * A persistent TypeScript language service over a virtual file system.
 *
 * The `ts.LanguageService` is created once and kept across changes: files are
 * diffed in (added, updated, removed) rather than the program rebuilt. Every
 * query takes and returns positions relative to a file's user content, with
 * the text injected around it (prefix and suffix) accounted for.
 *
 * `SDCPNLanguageServer` and `VisualizerLanguageServer` are the two programs
 * built on it, each with its own compiler options and bundled files.
 */
export class VirtualFileLanguageServer {
  protected readonly controller: LanguageServiceHostController;
  protected readonly service: ts.LanguageService;

  constructor(config: LanguageServiceHostConfig) {
    this.controller = createLanguageServiceHost(new Map(), config);
    this.service = ts.createLanguageService(this.controller.host);
  }

  /**
   * Make the files `isManaged` selects match `newFiles`: managed files absent
   * from the new set are removed, new ones added, changed ones updated. Files
   * outside the selection are left alone, so a sync of the net's files keeps
   * session files and the other way round.
   */
  protected reconcileFiles(
    newFiles: Map<string, VirtualFile>,
    isManaged: (fileName: string) => boolean,
  ): void {
    for (const existingName of this.controller.getFileNames()) {
      if (isManaged(existingName) && !newFiles.has(existingName)) {
        this.controller.removeFile(existingName);
      }
    }

    for (const [name, newFile] of newFiles) {
      if (!this.controller.hasFile(name)) {
        this.controller.addFile(name, newFile);
      } else {
        const existing = this.controller.getFile(name)!;
        if (!virtualFileEquals(existing, newFile)) {
          this.controller.updateFile(name, newFile);
        }
      }
    }
  }

  protected removeFilesUnder(prefix: string): void {
    for (const name of this.controller.getFileNames()) {
      if (name.startsWith(prefix)) {
        this.controller.removeFile(name);
      }
    }
  }

  protected getFileNamesUnder(prefix: string): string[] {
    return this.controller
      .getFileNames()
      .filter((name) => name.startsWith(prefix));
  }

  /** Update only the user content of a single file (e.g., when the user types in an editor). */
  updateDocumentContent(fileName: string, content: string): void {
    this.controller.updateContent(fileName, content);
  }

  /** Get the full text content (prefix + user content + suffix) of a virtual
   * file — the text the TypeScript service checks. */
  getFileContent(fileName: string): string | undefined {
    const file = this.controller.getFile(fileName);
    if (!file) {
      return undefined;
    }
    return (file.prefix ?? "") + file.content + (file.suffix ?? "");
  }

  /** Get only the user-visible content of a virtual file (without the injected prefix). */
  getUserContent(fileName: string): string | undefined {
    return this.controller.getFile(fileName)?.content;
  }

  getSemanticDiagnostics(fileName: string): ts.Diagnostic[] {
    const entry = this.controller.getFile(fileName);
    const prefixLength = entry?.prefix?.length ?? 0;
    const contentLength = entry?.suffix ? entry.content.length : undefined;
    const diagnostics = this.service.getSemanticDiagnostics(fileName);
    return adjustDiagnostics(diagnostics, prefixLength, contentLength);
  }

  getSyntacticDiagnostics(fileName: string): ts.Diagnostic[] {
    const entry = this.controller.getFile(fileName);
    const prefixLength = entry?.prefix?.length ?? 0;
    const contentLength = entry?.suffix ? entry.content.length : undefined;
    const diagnostics = this.service.getSyntacticDiagnostics(fileName);
    return adjustDiagnostics(diagnostics, prefixLength, contentLength);
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
