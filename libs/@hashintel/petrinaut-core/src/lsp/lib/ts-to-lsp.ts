/**
 * Pure conversion functions from TypeScript LanguageService types to LSP types.
 *
 * These define the stable contract between the TS LanguageService and all LSP
 * consumers (Monaco sync components, diagnostics panel, etc.).
 */
import ts from "typescript";
import {
  CompletionItemKind,
  type Diagnostic,
  DiagnosticSeverity,
  Range,
} from "vscode-languageserver-types";

import { offsetToPosition } from "./position-utils";

/**
 * Map `ts.DiagnosticCategory` to `DiagnosticSeverity`.
 * TS: 0=Warning, 1=Error, 2=Suggestion, 3=Message
 * LSP: 1=Error, 2=Warning, 3=Information, 4=Hint
 */
export function toLspSeverity(category: number): DiagnosticSeverity {
  switch (category) {
    case 0:
      return DiagnosticSeverity.Warning;
    case 1:
      return DiagnosticSeverity.Error;
    case 2:
      return DiagnosticSeverity.Hint;
    case 3:
      return DiagnosticSeverity.Information;
    default:
      return DiagnosticSeverity.Error;
  }
}

/**
 * Map TS `ScriptElementKind` strings to LSP `CompletionItemKind`.
 */
export function toCompletionItemKind(kind: string): CompletionItemKind {
  switch (kind) {
    case "method":
    case "construct":
      return CompletionItemKind.Method;
    case "function":
    case "local function":
      return CompletionItemKind.Function;
    case "constructor":
      return CompletionItemKind.Constructor;
    case "property":
    case "getter":
    case "setter":
      return CompletionItemKind.Property;
    case "parameter":
    case "var":
    case "local var":
    case "let":
    case "const":
      return CompletionItemKind.Variable;
    case "class":
      return CompletionItemKind.Class;
    case "interface":
      return CompletionItemKind.Interface;
    case "type":
    case "type parameter":
    case "primitive type":
    case "alias":
      return CompletionItemKind.TypeParameter;
    case "enum":
      return CompletionItemKind.Enum;
    case "enum member":
      return CompletionItemKind.EnumMember;
    case "module":
    case "external module name":
      return CompletionItemKind.Module;
    case "keyword":
      return CompletionItemKind.Keyword;
    case "string":
      return CompletionItemKind.Value;
    default:
      return CompletionItemKind.Text;
  }
}

/** Convert a TS diagnostic to an LSP Diagnostic with position-based ranges. */
export function serializeDiagnostic(
  diag: ts.Diagnostic,
  fileContent: string,
): Diagnostic {
  const start = diag.start ?? 0;
  const end = start + (diag.length ?? 0);
  return {
    severity: toLspSeverity(diag.category),
    range: Range.create(
      offsetToPosition(fileContent, start),
      offsetToPosition(fileContent, end),
    ),
    message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
    code: diag.code,
    source: "ts",
  };
}
