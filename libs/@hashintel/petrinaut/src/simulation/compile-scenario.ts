import type { Color, Parameter, Place, Scenario } from "../core/types/sdcpn";

// -- Result types -------------------------------------------------------------

/**
 * Compiled initial state entry for a single place.
 * - Uncolored places: `values` is empty, `count` is the token count.
 * - Colored places: `values` is the flattened element data, `count` is the
 *   number of tokens (rows).
 */
export interface CompiledPlaceMarking {
  values: number[];
  count: number;
}

export interface CompiledScenarioResult {
  /**
   * Resolved parameter values keyed by variableName (matches the format
   * expected by the simulation worker and SimulationContext).
   */
  parameterValues: Record<string, string>;
  /**
   * Resolved initial marking keyed by place ID.
   */
  initialState: Record<string, CompiledPlaceMarking>;
}

export interface ScenarioCompilationError {
  /** Which field failed: "parameterOverride", "initialState", or "scenarioParameter" */
  source: "parameterOverride" | "initialState" | "scenarioParameter";
  /** ID of the parameter or place that failed */
  itemId: string;
  /** Human-readable error message */
  message: string;
}

export type CompileScenarioOutcome =
  | { ok: true; result: CompiledScenarioResult }
  | { ok: false; errors: ScenarioCompilationError[] };

// -- Hardened expression evaluator --------------------------------------------

/**
 * Wrap a plain object in a prototype-less, frozen copy.
 * Severs the prototype chain so `obj.constructor.constructor("return globalThis")()`
 * cannot escape to globals.
 */
function createSafeObject(obj: Record<string, number>): Record<string, number> {
  return Object.freeze(Object.assign(Object.create(null), obj));
}

/**
 * Globals to shadow inside the expression function body.
 * Declared as `var` so they become `undefined` in scope, preventing
 * the expression from accessing browser/environment APIs.
 */
const SHADOWED_GLOBALS = [
  "window",
  "document",
  "globalThis",
  "self",
  "fetch",
  "XMLHttpRequest",
  "importScripts",
  // Note: `eval` cannot be shadowed via `var` in strict mode (SyntaxError).
  // It's mitigated by shadowing `Function` (blocks eval construction) and
  // `globalThis` (blocks globalThis.eval). Direct `eval()` in strict mode
  // cannot leak scope, and without access to globals it has limited power.
  "Function",
  "setTimeout",
  "setInterval",
  "queueMicrotask",
].join(",");

/**
 * Run a synchronous action with the constructor-chain escape route blocked.
 *
 * User expressions run inside `new Function()` and therefore share the host
 * realm. Shadowing `Function` as a local `var` only prevents identifier lookup;
 * an attacker can still walk to the real `Function` via any literal's
 * `.constructor.constructor` chain (e.g. `({}).constructor.constructor`), and
 * `createSafeObject` only protects the `parameters`/`scenario` arguments, not
 * freshly-created literals inside the expression body.
 *
 * To close that gap we temporarily replace the `.constructor` getter on every
 * built-in prototype a literal could reach. JS is single-threaded so this is
 * safe within a synchronous call: the descriptors are restored in `finally`
 * before any queued microtasks or other code runs. The rightful fix is a
 * Worker/iframe realm — this is defense-in-depth for the same-realm case.
 */
function runSandboxed<T>(action: () => T): T {
  const prototypes: object[] = [
    Object.prototype,
    Array.prototype,
    Function.prototype,
    String.prototype,
    Number.prototype,
    Boolean.prototype,
  ];
  const saved = prototypes.map((p) =>
    Object.getOwnPropertyDescriptor(p, "constructor"),
  );
  const blocked = () => {
    throw new Error("Access to .constructor is blocked inside scenario code.");
  };

  for (const p of prototypes) {
    Object.defineProperty(p, "constructor", {
      get: blocked,
      configurable: true,
    });
  }

  try {
    return action();
  } finally {
    for (const [i, p] of prototypes.entries()) {
      const original = saved[i];
      if (original) {
        Object.defineProperty(p, "constructor", original);
      }
    }
  }
}

/**
 * Evaluate a single JavaScript expression with `parameters` and `scenario`
 * in scope. Returns the result or throws with a descriptive message.
 *
 * Hardening:
 * - Strict mode (`this === undefined`)
 * - Prototype-less frozen objects (blocks `.constructor` chain walk on args)
 * - Dangerous globals shadowed with `var` declarations
 * - `.constructor` temporarily blocked on built-in prototypes (see
 *   `runSandboxed`) so literal-based constructor walks also fail.
 */
function evaluateExpression(
  expression: string,
  parameters: Record<string, number>,
  scenario: Record<string, number>,
): unknown {
  // eslint-disable-next-line no-new-func,typescript-eslint/no-implied-eval -- intentional: user-authored expressions
  const fn = new Function(
    "parameters",
    "scenario",
    `"use strict"; var ${SHADOWED_GLOBALS}; return (${expression});`,
  ) as (p: Record<string, number>, s: Record<string, number>) => unknown;
  return runSandboxed(() =>
    fn(createSafeObject(parameters), createSafeObject(scenario)),
  );
}

// -- Compiler -----------------------------------------------------------------

/**
 * Compile a scenario into concrete parameter values and initial token counts.
 *
 * Evaluation order (dependencies flow top-down):
 * 1. Scenario parameter defaults → builds the `scenario` object
 * 2. Parameter overrides → each expression evaluated with `{ parameters, scenario }`
 *    → produces the final `parameters` object
 * 3. Initial state expressions → each evaluated with the resolved `{ parameters, scenario }`
 *    → produces per-place token counts
 *
 * @param scenario - The scenario to compile
 * @param netParameters - The net-level parameter definitions (for defaults and variable names)
 * @param places - All places in the SDCPN (needed for code-mode name→ID mapping)
 * @param types - All color types (needed for code-mode token flattening)
 */
export function compileScenario(
  scenario: Scenario,
  netParameters: Parameter[],
  places: Place[] = [],
  types: Color[] = [],
): CompileScenarioOutcome {
  const errors: ScenarioCompilationError[] = [];

  // ── Step 1: Build the `scenario` object from scenario parameter defaults ──

  const scenarioObj: Record<string, number> = {};
  for (const sp of scenario.scenarioParameters) {
    if (sp.identifier.trim() === "") {
      continue;
    }
    scenarioObj[sp.identifier] = sp.default;
  }

  // ── Step 2: Evaluate parameter overrides ──
  //
  // Start with net-level defaults, then apply each override expression.
  // Expressions have access to the base `parameters` and `scenario`.

  const parametersObj: Record<string, number> = {};
  for (const param of netParameters) {
    parametersObj[param.variableName] = Number(param.defaultValue) || 0;
  }

  // Build a lookup: paramId → Parameter
  const paramById = new Map(netParameters.map((p) => [p.id, p]));

  for (const [paramId, expression] of Object.entries(
    scenario.parameterOverrides,
  )) {
    const param = paramById.get(paramId);
    if (!param) {
      continue;
    }
    const trimmed = expression.trim();
    if (trimmed === "") {
      // No override — keep the default
      continue;
    }
    try {
      const value = evaluateExpression(trimmed, parametersObj, scenarioObj);
      if (typeof value !== "number" || Number.isNaN(value)) {
        errors.push({
          source: "parameterOverride",
          itemId: paramId,
          message: `Parameter "${param.name}" expression evaluated to ${String(value)}, expected a number.`,
        });
        continue;
      }
      parametersObj[param.variableName] = value;
    } catch (err) {
      errors.push({
        source: "parameterOverride",
        itemId: paramId,
        message: `Parameter "${param.name}": ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // ── Step 3: Evaluate initial state ──

  const initialState: Record<string, CompiledPlaceMarking> = {};

  if (scenario.initialState.type === "code") {
    // Code mode: evaluate the full code block as a function body.
    // It returns an object keyed by place NAME (not ID) → array of token objects.
    const code = scenario.initialState.content.trim();
    if (code !== "") {
      try {
        // eslint-disable-next-line no-new-func,typescript-eslint/no-implied-eval -- intentional: user-authored code
        const fn = new Function(
          "parameters",
          "scenario",
          `"use strict"; var ${SHADOWED_GLOBALS}; ${code}`,
        ) as (p: Record<string, number>, s: Record<string, number>) => unknown;
        const result = runSandboxed(() =>
          fn(createSafeObject(parametersObj), createSafeObject(scenarioObj)),
        );

        if (typeof result !== "object" || result === null) {
          errors.push({
            source: "initialState",
            itemId: "__code__",
            message: `Initial state code must return an object, got ${typeof result}.`,
          });
        } else {
          // Build lookups: placeName → placeId, placeId → color elements
          const placeByName = new Map(places.map((p) => [p.name, p]));
          const typeById = new Map(types.map((t) => [t.id, t]));

          for (const [placeName, tokens] of Object.entries(result)) {
            const place = placeByName.get(placeName);
            if (!place) {
              continue; // Unknown place name — skip silently
            }

            if (typeof tokens === "number") {
              // Uncolored place: just a token count
              initialState[place.id] = {
                values: [],
                count: Math.max(0, Math.round(tokens)),
              };
            } else if (Array.isArray(tokens)) {
              // Colored place: array of token objects → flatten
              const color = place.colorId
                ? typeById.get(place.colorId)
                : undefined;
              const elements = color?.elements ?? [];
              const flat: number[] = [];
              for (const token of tokens) {
                if (typeof token === "object" && token !== null) {
                  for (const el of elements) {
                    flat.push(
                      Number((token as Record<string, unknown>)[el.name] ?? 0),
                    );
                  }
                }
              }
              initialState[place.id] = {
                values: flat,
                count: tokens.length,
              };
            }
          }
        }
      } catch (err) {
        errors.push({
          source: "initialState",
          itemId: "__code__",
          message: `Initial state code: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  } else {
    // Per-place mode: evaluate each expression individually
    for (const [placeId, value] of Object.entries(
      scenario.initialState.content,
    )) {
      // Colored places: number[][] stored directly — flatten to values + count
      if (Array.isArray(value)) {
        const flat: number[] = [];
        for (const row of value) {
          for (const v of row) {
            flat.push(v);
          }
        }
        initialState[placeId] = { values: flat, count: value.length };
        continue;
      }

      // Uncolored places: expression string → evaluate to token count
      const trimmed = value.trim();
      if (trimmed === "") {
        initialState[placeId] = { values: [], count: 0 };
        continue;
      }
      try {
        const result = evaluateExpression(trimmed, parametersObj, scenarioObj);
        if (typeof result !== "number" || Number.isNaN(result)) {
          errors.push({
            source: "initialState",
            itemId: placeId,
            message: `Initial state for place "${placeId}" evaluated to ${String(result)}, expected a number.`,
          });
          continue;
        }
        initialState[placeId] = {
          values: [],
          count: Math.max(0, Math.round(result)),
        };
      } catch (err) {
        errors.push({
          source: "initialState",
          itemId: placeId,
          message: `Initial state for place "${placeId}": ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Convert parameters to string values (SimulationContext format)
  const parameterValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(parametersObj)) {
    parameterValues[key] = String(value);
  }

  return { ok: true, result: { parameterValues, initialState } };
}
