import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  CompletionItemKind,
  DiagnosticSeverity,
} from "vscode-languageserver-types";

import {
  serializeDiagnostic,
  toCompletionItemKind,
  toLspSeverity,
} from "./ts-to-lsp";

describe("toLspSeverity", () => {
  it.for([
    { category: 0, expected: DiagnosticSeverity.Warning, label: "Warning" },
    { category: 1, expected: DiagnosticSeverity.Error, label: "Error" },
    { category: 2, expected: DiagnosticSeverity.Hint, label: "Suggestion" },
    {
      category: 3,
      expected: DiagnosticSeverity.Information,
      label: "Message",
    },
    { category: 99, expected: DiagnosticSeverity.Error, label: "unknown" },
  ])(
    "maps TS $label ($category) to LSP severity $expected",
    ({ category, expected }) => {
      expect(toLspSeverity(category)).toBe(expected);
    },
  );
});

describe("toCompletionItemKind", () => {
  it.for([
    { tsKind: "method", expected: CompletionItemKind.Method },
    { tsKind: "construct", expected: CompletionItemKind.Method },
    { tsKind: "function", expected: CompletionItemKind.Function },
    { tsKind: "local function", expected: CompletionItemKind.Function },
    { tsKind: "constructor", expected: CompletionItemKind.Constructor },
    { tsKind: "property", expected: CompletionItemKind.Property },
    { tsKind: "getter", expected: CompletionItemKind.Property },
    { tsKind: "setter", expected: CompletionItemKind.Property },
    { tsKind: "parameter", expected: CompletionItemKind.Variable },
    { tsKind: "var", expected: CompletionItemKind.Variable },
    { tsKind: "local var", expected: CompletionItemKind.Variable },
    { tsKind: "let", expected: CompletionItemKind.Variable },
    { tsKind: "const", expected: CompletionItemKind.Variable },
    { tsKind: "class", expected: CompletionItemKind.Class },
    { tsKind: "interface", expected: CompletionItemKind.Interface },
    { tsKind: "type", expected: CompletionItemKind.TypeParameter },
    { tsKind: "type parameter", expected: CompletionItemKind.TypeParameter },
    { tsKind: "primitive type", expected: CompletionItemKind.TypeParameter },
    { tsKind: "alias", expected: CompletionItemKind.TypeParameter },
    { tsKind: "enum", expected: CompletionItemKind.Enum },
    { tsKind: "enum member", expected: CompletionItemKind.EnumMember },
    { tsKind: "module", expected: CompletionItemKind.Module },
    { tsKind: "external module name", expected: CompletionItemKind.Module },
    { tsKind: "keyword", expected: CompletionItemKind.Keyword },
    { tsKind: "string", expected: CompletionItemKind.Value },
    { tsKind: "unknown-kind", expected: CompletionItemKind.Text },
  ])(
    'maps "$tsKind" to CompletionItemKind $expected',
    ({ tsKind, expected }) => {
      expect(toCompletionItemKind(tsKind)).toBe(expected);
    },
  );
});

describe("serializeDiagnostic", () => {
  const fileContent = "const x = 1;\nconst y = 2;\n";

  function makeTsDiagnostic(
    overrides: Partial<ts.Diagnostic> = {},
  ): ts.Diagnostic {
    return {
      file: undefined,
      start: 0,
      length: 5,
      messageText: "Test error",
      category: ts.DiagnosticCategory.Error,
      code: 2304,
      ...overrides,
    };
  }

  it("converts a simple TS diagnostic to LSP format", () => {
    const diag = makeTsDiagnostic({ start: 0, length: 5 });
    const result = serializeDiagnostic(diag, fileContent);

    expect(result.severity).toBe(DiagnosticSeverity.Error);
    expect(result.message).toBe("Test error");
    expect(result.code).toBe(2304);
    expect(result.source).toBe("ts");
    expect(result.range.start).toEqual({ line: 0, character: 0 });
    expect(result.range.end).toEqual({ line: 0, character: 5 });
  });

  it("handles a diagnostic on the second line", () => {
    // "const y" starts at offset 13 (after "const x = 1;\n")
    const diag = makeTsDiagnostic({ start: 13, length: 7 });
    const result = serializeDiagnostic(diag, fileContent);

    expect(result.range.start).toEqual({ line: 1, character: 0 });
    expect(result.range.end).toEqual({ line: 1, character: 7 });
  });

  it("handles a diagnostic spanning across lines", () => {
    // From offset 6 ("= 1;\nconst") to offset 19
    const diag = makeTsDiagnostic({ start: 6, length: 13 });
    const result = serializeDiagnostic(diag, fileContent);

    expect(result.range.start).toEqual({ line: 0, character: 6 });
    expect(result.range.end).toEqual({ line: 1, character: 6 });
  });

  it("defaults start to 0 when undefined", () => {
    const diag = makeTsDiagnostic({ start: undefined, length: 3 });
    const result = serializeDiagnostic(diag, fileContent);

    expect(result.range.start).toEqual({ line: 0, character: 0 });
    expect(result.range.end).toEqual({ line: 0, character: 3 });
  });

  it("defaults length to 0 when undefined", () => {
    const diag = makeTsDiagnostic({ start: 6, length: undefined });
    const result = serializeDiagnostic(diag, fileContent);

    // start and end should be the same position
    expect(result.range.start).toEqual(result.range.end);
  });

  it("flattens chained diagnostic messages", () => {
    const diag = makeTsDiagnostic({
      messageText: {
        messageText: "Outer error",
        category: ts.DiagnosticCategory.Error,
        code: 1000,
        next: [
          {
            messageText: "Inner cause",
            category: ts.DiagnosticCategory.Error,
            code: 1001,
            next: undefined,
          },
        ],
      },
    });
    const result = serializeDiagnostic(diag, fileContent);

    expect(result.message).toContain("Outer error");
    expect(result.message).toContain("Inner cause");
  });

  it("maps TS warning category to LSP warning severity", () => {
    const diag = makeTsDiagnostic({
      category: ts.DiagnosticCategory.Warning,
    });
    const result = serializeDiagnostic(diag, fileContent);

    expect(result.severity).toBe(DiagnosticSeverity.Warning);
  });
});
