/**
 * HIR-based semantic linting.
 *
 * Combines lowering, type checking and analyses into a single diagnostics
 * pass over one piece of user code. All spans are relative to the
 * user-visible source text, so results can be surfaced in the editor without
 * adjustment.
 *
 * Lowering failures short-circuit: when the code is outside the analyzable
 * subset the result carries a single positioned diagnostic (downgraded to a
 * severity chosen by the caller) and no artifacts.
 */
import { analyzeHir, foldHir } from "./analyze";
import {
  emitBufferDynamicsJs,
  emitBufferKernelJs,
  emitBufferLambdaJs,
  emitBufferMetricJs,
} from "./emit-buffer-js";
import { walkHir } from "./hir";
import { lowerTypeScriptToHir } from "./lower-typescript";
import { typecheckHir } from "./typecheck";

import type { HirAnalysis } from "./analyze";
import type { HirDiagnostic, HirFunction, Span } from "./hir";
import type { HirSurfaceContext } from "./surface-context";
import type { HirTypecheckResult } from "./typecheck";

export type HirLintResult = {
  diagnostics: HirDiagnostic[];
  /** Present when lowering succeeded. */
  fn?: HirFunction;
  analysis?: HirAnalysis;
  typecheck?: HirTypecheckResult;
};

export type HirLintOptions = {
  /**
   * Severity for out-of-subset diagnostics. The HIR pipeline is the only
   * compiler — code outside the subset cannot run — so these default to
   * errors; tooling that only analyzes may downgrade them.
   * @default "error"
   */
  subsetSeverity?: HirDiagnostic["severity"];
};

/** Lint codes that describe out-of-subset code rather than definite bugs. */
const SUBSET_CODES = new Set([
  "hir:unsupported-statement",
  "hir:unsupported-syntax",
  "hir:unsupported-operator",
  "hir:unsupported-call",
  "hir:mutable-binding",
  "hir:destructured-binding",
  "hir:destructured-parameter",
  "hir:if-statement",
  "hir:loop-statement",
  "hir:early-return",
  "hir:spread",
  "hir:computed-key",
  "hir:map-callback",
  "hir:unknown-math-function",
  "hir:math-reference",
]);

const SUBSET_NOTE =
  " Petrinaut compiles a restricted TypeScript subset — rewrite using `const` bindings, conditionals (`?:` or guard `if`s), `.map(...)` and `Math.*`.";

function collectMathRandomSpans(fn: HirFunction): Span[] {
  const spans: Span[] = [];
  walkHir(fn.body, (expr) => {
    if (expr.kind === "mathCall" && expr.fn === "random") {
      spans.push(expr.span);
    }
  });
  return spans;
}

function canEmitBufferProgram(
  fn: HirFunction,
  context: HirSurfaceContext,
): boolean {
  switch (context.surface) {
    case "dynamics":
      return emitBufferDynamicsJs(fn, context.elements) !== null;
    case "lambda":
      return emitBufferLambdaJs(fn, context) !== null;
    case "kernel":
      return emitBufferKernelJs(fn, context) !== null;
    case "metric":
      return emitBufferMetricJs(fn, context) !== null;
  }
}

/**
 * Lints one piece of user code (a full `export default Ctor(...)` module).
 *
 * Callers should skip this when the TypeScript checker already reports errors
 * for the same code — HIR lints assume syntactically and type-valid input.
 */
export function lintHirUserCode(
  code: string,
  context: HirSurfaceContext,
  options: HirLintOptions = {},
): HirLintResult {
  const subsetSeverity = options.subsetSeverity ?? "error";
  const lowered = lowerTypeScriptToHir(code, context.surface);

  if (!lowered.ok) {
    return {
      diagnostics: lowered.diagnostics.map((diagnostic) =>
        SUBSET_CODES.has(diagnostic.code)
          ? {
              ...diagnostic,
              severity: subsetSeverity,
              message: diagnostic.message + SUBSET_NOTE,
            }
          : diagnostic,
      ),
    };
  }

  const { fn } = lowered;
  const typecheck = typecheckHir(fn, context);
  const analysis = analyzeHir(fn);
  const diagnostics: HirDiagnostic[] = [...typecheck.diagnostics];

  // --- Reproducibility -----------------------------------------------------
  if (analysis.dependencies.usesMathRandom) {
    for (const node of collectMathRandomSpans(fn)) {
      diagnostics.push({
        code: "hir:math-random",
        severity: "warning",
        message:
          "`Math.random()` is not seeded — simulation runs will not be reproducible." +
          (context.surface === "kernel"
            ? " Use `Distribution.Uniform(min, max)` instead."
            : ""),
        span: node,
      });
    }
  }

  // --- Dead transitions ----------------------------------------------------
  if (context.surface === "lambda") {
    const folded = foldHir(fn.body);
    if (
      (context.lambdaType === "stochastic" &&
        folded.kind === "numberLit" &&
        folded.value === 0) ||
      (context.lambdaType === "predicate" &&
        folded.kind === "boolLit" &&
        !folded.value)
    ) {
      diagnostics.push({
        code: "hir:transition-never-fires",
        severity: "warning",
        message:
          context.lambdaType === "stochastic"
            ? "This rate is always 0 — the transition will never fire."
            : "This predicate is always false — the transition will never fire.",
        span: folded.span,
      });
    }
  }

  // --- Shared distribution draws -------------------------------------------
  for (const nodeId of analysis.distributionDag.sharedSampleNodeIds) {
    const node = analysis.distributionDag.nodes.find(
      (candidate) => candidate.nodeId === nodeId,
    );
    if (!node) {
      continue;
    }
    const sinkCount = analysis.distributionDag.sinks.filter(
      (sink) => sink.nodeId === nodeId,
    ).length;
    diagnostics.push({
      code: "hir:shared-sample",
      severity: "info",
      message: `This distribution feeds ${sinkCount} output attributes — they will all receive the same sampled value. Construct separate distributions for independent samples.`,
      span: node.span,
    });
  }

  // --- Unused bindings -------------------------------------------------------
  for (const binding of analysis.bindings) {
    if (binding.referenceCount === 0 && !binding.name.startsWith("_")) {
      diagnostics.push({
        code: "hir:unused-binding",
        severity: "hint",
        message: `\`${binding.name}\` is never used.`,
        span: binding.nameSpan,
      });
    }
  }

  // --- Buffer compilability -------------------------------------------------
  // Every runtime surface has exactly one program shape. Surface emitter
  // failures here so editor gating matches `compileHirArtifacts` exactly.
  if (
    !diagnostics.some((diagnostic) => diagnostic.severity === "error") &&
    !canEmitBufferProgram(fn, context)
  ) {
    diagnostics.push({
      code: "hir:not-compilable",
      severity: "error",
      message:
        "This code shape cannot be compiled to a buffer program (e.g. dynamic token indices, structurally-dynamic results). Restructure it as static token records / `.map(...)` over input tokens.",
      span: fn.body.span,
    });
  }

  return { diagnostics, fn, analysis, typecheck };
}
