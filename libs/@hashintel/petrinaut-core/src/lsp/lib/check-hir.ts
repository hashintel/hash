/**
 * Bridges HIR semantic lints into the TypeScript-diagnostic-shaped pipeline
 * used by the checker and the LSP worker.
 *
 * HIR lint spans are already relative to the user-visible source text, so no
 * prefix adjustment is needed — the produced diagnostics can be serialized
 * with the same `serializeDiagnostic` path as adjusted TS diagnostics.
 */
import ts from "typescript";

import { lintHirUserCode } from "../../hir";

import type { HirDiagnostic, HirSurfaceContext } from "../../hir";

/**
 * Stable numeric codes for HIR diagnostics (ts.Diagnostic.code is numeric).
 * Codes ≥ 99000 are reserved for Petrinaut's own checks. Append only — these
 * appear in editor UI and may be referenced in docs.
 */
export const HIR_DIAGNOSTIC_CODES: Record<string, number> = {
  "hir:parse-error": 99001,
  "hir:missing-default-export": 99002,
  "hir:multiple-default-exports": 99003,
  "hir:missing-constructor": 99004,
  "hir:constructor-arity": 99005,
  "hir:missing-function": 99006,
  "hir:too-many-parameters": 99007,
  "hir:destructured-parameter": 99008,
  "hir:unsupported-statement": 99009,
  "hir:mutable-binding": 99010,
  "hir:destructured-binding": 99011,
  "hir:missing-initializer": 99012,
  "hir:early-return": 99013,
  "hir:empty-return": 99014,
  "hir:if-statement": 99015,
  "hir:loop-statement": 99016,
  "hir:missing-return": 99017,
  "hir:unsupported-operator": 99018,
  "hir:unsupported-syntax": 99019,
  "hir:unsupported-call": 99020,
  "hir:unknown-identifier": 99021,
  "hir:bare-parameters-object": 99022,
  "hir:math-reference": 99023,
  "hir:unknown-math-function": 99024,
  "hir:unknown-distribution": 99025,
  "hir:map-arity": 99026,
  "hir:map-callback": 99027,
  "hir:computed-key": 99028,
  "hir:spread": 99029,
  "hir:string-value": 99030,
  "hir:uuid-arity": 99031,
  "hir:unknown-uuid-helper": 99032,
  "hir:uuid-outside-kernel": 99033,
  "hir:string-call-arity": 99034,
  "hir:unknown-parameter": 99040,
  "hir:unknown-field": 99041,
  "hir:invalid-field-access": 99042,
  "hir:invalid-index": 99043,
  "hir:index-out-of-bounds": 99044,
  "hir:invalid-length": 99045,
  "hir:type-mismatch": 99046,
  "hir:duplicate-key": 99047,
  "hir:invalid-map": 99048,
  "hir:math-arity": 99049,
  "hir:distribution-arity": 99050,
  "hir:distribution-outside-kernel": 99051,
  "hir:distribution-disabled": 99052,
  "hir:dynamics-return": 99053,
  "hir:unknown-attribute": 99054,
  "hir:discrete-derivative": 99055,
  "hir:lambda-return": 99056,
  "hir:kernel-return": 99057,
  "hir:unknown-output-place": 99058,
  "hir:output-token-count": 99059,
  "hir:distribution-discrete-attribute": 99060,
  "hir:missing-attribute": 99061,
  "hir:missing-output-place": 99062,
  "hir:unreachable-code": 99063,
  "hir:math-random": 99070,
  "hir:transition-never-fires": 99071,
  "hir:shared-sample": 99072,
  "hir:unused-binding": 99073,
  // --- Appended (registry is append-only) ---
  "hir:reduce-arity": 99035,
  "hir:concat-arity": 99036,
  "hir:metric-return": 99064,
  "hir:not-compilable": 99074,
};

const FALLBACK_CODE = 99000;

function toTsCategory(
  severity: HirDiagnostic["severity"],
): ts.DiagnosticCategory {
  switch (severity) {
    case "error":
      return ts.DiagnosticCategory.Error;
    case "warning":
      return ts.DiagnosticCategory.Warning;
    case "info":
      return ts.DiagnosticCategory.Message;
    case "hint":
      return ts.DiagnosticCategory.Suggestion;
  }
}

function toTsDiagnostic(diagnostic: HirDiagnostic): ts.Diagnostic {
  return {
    file: undefined,
    start: diagnostic.span.start,
    length: diagnostic.span.length,
    messageText: diagnostic.message,
    category: toTsCategory(diagnostic.severity),
    code: HIR_DIAGNOSTIC_CODES[diagnostic.code] ?? FALLBACK_CODE,
    source: "hir",
  };
}

/**
 * Runs the HIR semantic linter over one item's user code, returning
 * TS-diagnostic-shaped results with offsets relative to the user content.
 *
 * Callers should only invoke this when TypeScript reported no errors for the
 * item — HIR lints assume type-valid input, and stacking both would be noise.
 */
export function getHirDiagnosticsForItem(
  code: string,
  context: HirSurfaceContext,
): ts.Diagnostic[] {
  // An empty lambda intentionally uses the runtime default (Infinity/true).
  // Every other surface requires a program and must report its lowering error.
  if (code.trim() === "" && context.surface === "lambda") {
    return [];
  }
  // Out-of-subset code is an error: the HIR pipeline is the only compiler,
  // so such code cannot simulate.
  const result = lintHirUserCode(code, context, { subsetSeverity: "error" });
  return result.diagnostics.map(toTsDiagnostic);
}
