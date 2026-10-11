/**
 * Oxlint plugin that reports the React Compiler diagnostics of
 * `oxc-transform-react`, the compiler `@vitejs/plugin-react` runs in the build.
 *
 * Each compiler error category is one rule, named as in
 * `eslint-plugin-react-hooks`, so `react-compiler/refs` reports what the build
 * prints as `react-compiler(Refs)`. The compiler runs once per file in lint
 * mode and every enabled rule reports its share of the diagnostics.
 *
 * The compiler is resolved from the linted file, so each package is checked by
 * the version its own build uses.
 */
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";

/** Rule name for each compiler category whose name is not its kebab-case form. */
const renamedCategories = {
  EffectDependencies: "memoized-effect-dependencies",
  EffectDerivationsOfState: "no-deriving-state-in-effects",
  EffectSetState: "set-state-in-effect",
  Factories: "component-hook-factories",
  PreserveManualMemo: "preserve-manual-memoization",
  RenderSetState: "set-state-in-render",
  Suppression: "rule-suppression",
};

const categories = [
  "AutomaticEffectDependencies",
  "CapitalizedCalls",
  "Config",
  "EffectDependencies",
  "EffectDerivationsOfState",
  "EffectExhaustiveDependencies",
  "EffectSetState",
  "ErrorBoundaries",
  "Factories",
  "FBT",
  "Fire",
  "Gating",
  "Globals",
  "Hooks",
  "Immutability",
  "IncompatibleLibrary",
  "Invariant",
  "MemoDependencies",
  "PreserveManualMemo",
  "Purity",
  "Refs",
  "RenderSetState",
  "StaticComponents",
  "Suppression",
  "Syntax",
  "Todo",
  "UnsupportedSyntax",
  "UseMemo",
  "VoidUseMemo",
];

const toRuleName = (category) =>
  renamedCategories[category] ??
  category
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

/** Reports a diagnostic whose category this plugin does not know yet. */
const uncategorizedRule = "uncategorized";

/**
 * Validations `eslint-plugin-react-hooks` enables on top of the compiler
 * defaults. The build runs without them.
 */
const lintEnvironment = {
  validateRefAccessDuringRender: true,
  validateNoSetStateInRender: true,
  validateNoSetStateInEffects: true,
  validateNoJsxInTryStatements: true,
  validateNoImpureFunctionsInRender: true,
  validateStaticComponents: true,
  validateNoFreezingKnownMutableFunctions: true,
  validateNoVoidUseMemo: true,
  validateNoCapitalizedCalls: [],
  validateHooksUsage: true,
  validateNoDerivedComputationsInEffects: true,
};

/** Files `@vitejs/plugin-react` hands to the compiler. */
const compiledCodeFilter = /forwardRef|memo|\b(?:[A-Z]|use[A-Z0-9])/;

const optOutDirectives = new Set(["use no memo", "use no forget"]);

const functionTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
]);

/** The compiler prints its category as the diagnostic code. */
const categoryPattern = /react-compiler\((\w+)\)/;

const compilers = new Map();

const loadCompiler = (filename) => {
  const path = createRequire(filename).resolve("oxc-transform-react");
  let compiler = compilers.get(path);
  if (!compiler) {
    compiler = createRequire(filename)(path);
    compilers.set(path, compiler);
  }
  return compiler;
};

const directivesOf = (node) => {
  if (node.type === "Program") {
    return node.body;
  }
  if (functionTypes.has(node.type) && node.body?.type === "BlockStatement") {
    return node.body.body;
  }
  return [];
};

const isOptedOut = (sourceCode, index) => {
  for (
    let node = sourceCode.getNodeByRangeIndex(index);
    node;
    node = node.parent
  ) {
    if (
      directivesOf(node).some((statement) =>
        optOutDirectives.has(statement.directive),
      )
    ) {
      return true;
    }
  }
  return false;
};

/** The findings of the file the rules are visiting, computed once. */
let lastRun;

const analyse = (context) => {
  const { physicalFilename: filename, sourceCode } = context;
  const { text } = sourceCode;
  if (lastRun?.filename === filename && lastRun.text === text) {
    return lastRun.findings;
  }

  let findings = [];
  if (!filename.endsWith(".d.ts") && compiledCodeFilter.test(text)) {
    const { transformSync } = loadCompiler(filename);
    const { errors } = transformSync(filename, text, {
      reactCompiler: {
        outputMode: "lint",
        panicThreshold: "none",
        reportDiagnostics: true,
        environment: lintEnvironment,
      },
    });

    // Compiler offsets count UTF-8 bytes; oxlint locations count UTF-16 units.
    const bytes = Buffer.from(text);
    const toIndex = (offset) =>
      bytes.subarray(0, offset).toString("utf8").length;

    findings = errors.flatMap((error) => {
      const label = error.labels[0];
      const start = toIndex(label?.start ?? 0);
      // A bailout in a function the build skips cannot fail the build.
      if (error.severity === "Advice" && isOptedOut(sourceCode, start)) {
        return [];
      }
      const category = categoryPattern.exec(error.codeframe ?? "")?.[1];
      return [
        {
          rule:
            category && categories.includes(category)
              ? toRuleName(category)
              : uncategorizedRule,
          message: error.helpMessage
            ? `${error.message}\n\n${error.helpMessage}`
            : error.message,
          loc: {
            start: sourceCode.getLocFromIndex(start),
            end: sourceCode.getLocFromIndex(toIndex(label?.end ?? 0)),
          },
        },
      ];
    });
  }

  lastRun = { filename, text, findings };
  return findings;
};

const createRule = (ruleName) => ({
  meta: { type: "problem" },
  create: (context) => ({
    Program: () => {
      for (const finding of analyse(context)) {
        if (finding.rule === ruleName) {
          context.report({ message: finding.message, loc: finding.loc });
        }
      }
    },
  }),
});

export default {
  meta: { name: "react-compiler" },
  rules: Object.fromEntries(
    [...categories.map(toRuleName), uncategorizedRule].map((ruleName) => [
      ruleName,
      createRule(ruleName),
    ]),
  ),
};
