/**
 * Monaco Completion Provider backed by the LSP worker.
 *
 * Converts TypeScript CompletionInfo to Monaco CompletionList format.
 */

import type * as Monaco from "monaco-editor";

import { isSDCPNCodeFile, monacoPathToLspPath } from "./file-path-mapper";
import type { LSPClient } from "./lsp-client";

/**
 * Mapping from TypeScript ScriptElementKind strings to Monaco CompletionItemKind values.
 * Uses a lookup map to avoid switch statement enum comparison issues.
 */
const TS_KIND_TO_MONACO_KIND: Record<string, number> = {
  keyword: 17, // Keyword
  script: 8, // Module
  module: 8, // Module
  "external module name": 8, // Module
  class: 5, // Class
  "local class": 5, // Class
  interface: 7, // Interface
  type: 24, // TypeParameter
  "type parameter": 24, // TypeParameter
  enum: 15, // Enum
  "enum member": 16, // EnumMember
  var: 4, // Variable
  "local var": 4, // Variable
  let: 4, // Variable
  const: 4, // Variable
  function: 2, // Function
  "local function": 2, // Function
  method: 1, // Method
  property: 9, // Property
  getter: 9, // Property
  setter: 9, // Property
  constructor: 3, // Constructor
  call: 2, // Function
  index: 9, // Property
  construct: 3, // Constructor
  parameter: 4, // Variable
  "primitive type": 17, // Keyword
  label: 0, // Text
  alias: 17, // Reference
  string: 11, // Value
  directory: 18, // Folder
};

const DEFAULT_KIND = 0; // Text

/**
 * Maps TypeScript completion kind to Monaco completion kind value.
 */
function tsKindToMonacoKind(kind: string): number {
  return TS_KIND_TO_MONACO_KIND[kind] ?? DEFAULT_KIND;
}

/**
 * Creates a Monaco CompletionItemProvider that uses the LSP client.
 */
export function createLSPCompletionProvider(
  _monaco: typeof Monaco,
  getClient: () => LSPClient | null,
): Monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: [".", '"', "'", "`", "/", "@", "<", "#", " "],

    async provideCompletionItems(
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
      _context: Monaco.languages.CompletionContext,
      _token: Monaco.CancellationToken,
    ): Promise<Monaco.languages.CompletionList | null> {
      const client = getClient();
      if (!client) {
        return null;
      }

      const uri = model.uri.toString();

      // Check if this is an SDCPN file
      if (!isSDCPNCodeFile(uri)) {
        return null;
      }

      const lspPath = monacoPathToLspPath(uri);
      if (!lspPath) {
        return null;
      }

      // Calculate offset from position
      const offset = model.getOffsetAt(position);

      try {
        const completions = await client.getCompletions(lspPath, offset);
        if (!completions?.entries) {
          return { suggestions: [] };
        }

        // Get the word range for replacement
        const wordInfo = model.getWordUntilPosition(position);
        const range: Monaco.IRange = {
          startLineNumber: position.lineNumber,
          startColumn: wordInfo.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: wordInfo.endColumn,
        };

        const suggestions: Monaco.languages.CompletionItem[] =
          completions.entries.map((entry, index) => ({
            label: entry.name,
            kind: tsKindToMonacoKind(entry.kind),
            insertText: entry.insertText ?? entry.name,
            range,
            sortText: entry.sortText || String(index).padStart(5, "0"),
            detail: entry.kindModifiers,
            // Use isRecommended for boosting suggested items
            preselect: entry.isRecommended,
          }));

        return { suggestions };
      } catch {
        // Silently handle completion errors - they're not critical
        return { suggestions: [] };
      }
    },
  };
}
