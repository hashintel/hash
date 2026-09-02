/**
 * Continuous dynamics: integrating each token's `real` attributes in place.
 *
 * A token's derivative reads only that token's own attributes, so integration
 * is local to one invocation and every RK stage fits in the same loop body.
 */
import { WgslBailError, WgslEmitter } from "../emit-wgsl";
import { commentSafe } from "../wgsl-identifiers";

import type { HirExpr, HirFunction } from "../../hir/hir";
import type { GpuPlaceProfile } from "../eligibility";
import type { WgslParameterValue, WgslValue } from "../emit-wgsl";
import type { StateLayout } from "./token-layout";

export type GpuOdeMethod = "euler" | "rk2" | "rk4";

/**
 * Extracts a place's per-token derivative expressions from dynamics HIR,
 * which is `tokens.map(token => ({ field: expr }))`.
 */
const emitDerivatives = (
  fn: HirFunction,
  realFields: readonly string[],
  parameterValues: Readonly<Record<string, WgslParameterValue>>,
  fieldExpression: (fieldName: string) => string,
  /**
   * Distinguishes this stage's hoisted temporaries from the other stages'.
   * Every stage's statements are spliced into the same WGSL scope, so without
   * it each stage would redeclare the previous stage's names.
   */
  identifierScope: string,
): { statements: string[]; derivatives: Map<string, string> } => {
  let body: HirExpr = fn.body;
  const outerBindings = body.kind === "let" ? body.bindings : [];
  if (body.kind === "let") {
    body = body.body;
  }

  const tokensParam = fn.params[0];
  if (
    !tokensParam ||
    body.kind !== "arrayMap" ||
    body.target.kind !== "localRef" ||
    body.target.name !== tokensParam.name
  ) {
    throw new WgslBailError(
      "dynamics must be a direct `tokens.map(...)` over the place's tokens",
    );
  }

  const emitter = new WgslEmitter({ parameterValues, identifierScope });
  const env = new Map<string, WgslValue>();
  for (const binding of outerBindings) {
    env.set(
      binding.name,
      emitter.hoist(binding.name, emitter.emit(binding.value, env)),
    );
  }

  // The token binding resolves attribute reads to whatever accessor the caller
  // supplies, so the same HIR serves each RK stage at a different trial state.
  env.set(body.param.name, {
    kind: "token",
    read: (fieldName) => ({ kind: "f32", code: fieldExpression(fieldName) }),
  });

  let mapBody: HirExpr = body.body;
  if (mapBody.kind === "let") {
    for (const binding of mapBody.bindings) {
      env.set(
        binding.name,
        emitter.hoist(binding.name, emitter.emit(binding.value, env)),
      );
    }
    mapBody = mapBody.body;
  }
  if (mapBody.kind !== "recordLit") {
    throw new WgslBailError("dynamics must return a record of derivatives");
  }

  const derivatives = new Map<string, string>();
  for (const field of realFields) {
    const entry = mapBody.entries.find((candidate) => candidate.key === field);
    // A field with no entry has zero derivative, matching the CPU emitter.
    derivatives.set(
      field,
      entry ? emitter.f32(emitter.emit(entry.value, env)) : "0.0",
    );
  }

  return { statements: [...emitter.statements], derivatives };
};

const stageNamesFor = (odeMethod: GpuOdeMethod): string[] =>
  odeMethod === "euler"
    ? ["k1"]
    : odeMethod === "rk2"
      ? ["k1", "k2"]
      : ["k1", "k2", "k3", "k4"];

/** The trial state attribute `ordinal` is read at for RK stage `stage`. */
const trialState = (
  odeMethod: GpuOdeMethod,
  stage: number,
  ordinal: number,
): string => {
  if (stage === 0) return `y${ordinal}`;
  if (odeMethod === "rk2") return `(y${ordinal} + 0.5 * DT * k1_${ordinal})`;
  if (stage === 1) return `(y${ordinal} + 0.5 * DT * k1_${ordinal})`;
  if (stage === 2) return `(y${ordinal} + 0.5 * DT * k2_${ordinal})`;
  return `(y${ordinal} + DT * k3_${ordinal})`;
};

const combinedStep = (odeMethod: GpuOdeMethod, ordinal: number): string =>
  odeMethod === "euler"
    ? `y${ordinal} + DT * k1_${ordinal}`
    : odeMethod === "rk2"
      ? `y${ordinal} + DT * k2_${ordinal}`
      : `y${ordinal} + (DT / 6.0) * (k1_${ordinal} + 2.0 * k2_${ordinal} + 2.0 * k3_${ordinal} + k4_${ordinal})`;

/**
 * Emits one integration step over every token of each place with dynamics.
 */
export const emitDynamics = (
  push: (line: string) => void,
  options: {
    places: readonly GpuPlaceProfile[];
    dynamicsHir: ReadonlyMap<string, HirFunction>;
    layout: StateLayout;
    parameterValues: Readonly<Record<string, WgslParameterValue>>;
    odeMethod: GpuOdeMethod;
  },
): void => {
  const { places, dynamicsHir, layout, parameterValues, odeMethod } = options;
  for (const [index, place] of places.entries()) {
    const hir = dynamicsHir.get(place.id);
    if (hir === undefined || place.realFields.length === 0) {
      continue;
    }
    const stride = layout.placeTokenStrides[index]!;
    const tokenBase = layout.placeTokenOffsets[index]!;

    push(`    // dynamics: ${commentSafe(place.name)} (${odeMethod})`);
    push(`    if (running) {`);
    push(`      for (var t: u32 = 0u; t < counts[${index}u]; t = t + 1u) {`);
    push(`        let slot = base + ${tokenBase}u + t * ${stride}u;`);
    for (const [ordinal] of place.realFields.entries()) {
      push(
        `        let y${ordinal} = bitcast<f32>(state[slot + ${ordinal}u]);`,
      );
    }

    for (const [stage, stageName] of stageNamesFor(odeMethod).entries()) {
      const { statements, derivatives } = emitDerivatives(
        hir,
        place.realFields,
        parameterValues,
        (fieldName) => {
          const ordinal = place.realFields.indexOf(fieldName);
          if (ordinal < 0) {
            throw new WgslBailError(
              `dynamics for \`${place.name}\` reads \`${fieldName}\`, which is not a real attribute`,
            );
          }
          return trialState(odeMethod, stage, ordinal);
        },
        `${stageName}_`,
      );
      for (const statement of statements) {
        push(`        ${statement}`);
      }
      for (const [ordinal, field] of place.realFields.entries()) {
        push(
          `        let ${stageName}_${ordinal}: f32 = ${derivatives.get(field) ?? "0.0"};`,
        );
      }
    }

    for (const [ordinal] of place.realFields.entries()) {
      push(
        `        state[slot + ${ordinal}u] = bitcast<u32>(${combinedStep(odeMethod, ordinal)});`,
      );
    }
    push(`      }`);
    push(`    }`);
    push("");
  }
};
