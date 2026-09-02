/**
 * Whether a transition fires this frame, and which tokens it consumes.
 *
 * Enabledness is structural (arc weights, inhibitors, capacity) and then the
 * lambda's say. A typed input needs a *choice* of tokens: the CPU walks
 * `indexCombinations` and fires on the first passing combination, so the
 * shader scans candidates in that same order. One typed input place is
 * supported; several would enumerate the Cartesian product of their
 * combinations, which is a mixed-radix scan over per-place counts, and it
 * would land in this module.
 */
import { buildLambdaContext } from "../../hir/surface-context";
import { emitPairScanWgsl } from "./pair-selection";
import { computeTransitionCapacityConstraints } from "../../simulation/engine/capacity";
import { WgslBailError, WgslEmitter } from "../emit-wgsl";
import { commentSafe } from "../wgsl-identifiers";
import {
  makeTokenReader,
  tokenSlotExpr,
  tokenSlotsValue,
} from "./token-layout";

import type { PetrinautExtensionSettings } from "../../extensions";
import type { HirFunction } from "../../hir/hir";
import type { SDCPN } from "../../types/sdcpn";
import type { GpuNetProfile } from "../eligibility";
import type { WgslParameterValue, WgslValue } from "../emit-wgsl";
import type { DiscreteType, StateLayout, TokenReader } from "./token-layout";

type Transition = SDCPN["transitions"][number];
type InputArc = Transition["inputArcs"][number];

/** An arc with the profile index of the place at its far end. */
export type ArcPlace<Arc> = { arc: Arc; placeId: string; placeIndex: number };

/**
 * Pairs each arc with its place, dropping arcs whose endpoint is not a
 * place of this net (a component port).
 */
export const resolveArcPlaces = <Arc>(
  arcs: readonly Arc[],
  endpointPlaceId: (arc: Arc) => string | null,
  placeIndexById: ReadonlyMap<string, number>,
): ArcPlace<Arc>[] =>
  arcs.flatMap((arc) => {
    const placeId = endpointPlaceId(arc);
    if (placeId === null) {
      return [];
    }
    const placeIndex = placeIndexById.get(placeId);
    if (placeIndex === undefined) {
      throw new WgslBailError(`transition references unknown place ${placeId}`);
    }
    return [{ arc, placeId, placeIndex }];
  });

export type TransitionFiring = {
  inputs: readonly ArcPlace<InputArc>[];
  /** WGSL for structural enabledness: arc guards and capacity constraints. */
  enabledCondition: string;
  /** The typed place tokens are chosen from, or null for an uncoloured firing. */
  scanPlaceIndex: number | null;
  /** Tokens consumed from the scanned place: 0, 1 or 2. */
  typedWeight: number;
  /** `sel_*`: the chosen slots, in the order the lambda destructures them. */
  selectionVars: readonly string[];
  /** Readers over the scan's candidates (`cand_*`), for the lambda. */
  tokenSlots: ReadonlyMap<string, readonly TokenReader[]>;
  /** The same readers over the chosen slots (`sel_*`), for the kernel. */
  selectionTokenSlots: ReadonlyMap<string, readonly TokenReader[]>;
};

/**
 * The name a lambda's `tokens` record uses for the typed input arc's slot.
 *
 * Taken from `buildLambdaContext` rather than derived from the place name, so
 * component-port scoping and the engine's last-arc-with-a-name-wins rule are
 * whatever the HIR was type-checked against. `inputSlots` holds exactly the
 * typed non-inhibitor arcs, so with one typed arc it is the sole slot.
 */
const lambdaSlotName = (
  transition: Transition,
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings | undefined,
): string => {
  const slot = buildLambdaContext(sdcpn, transition, extensions).inputSlots[0];
  if (slot === undefined) {
    throw new WgslBailError(
      `transition \`${transition.name}\` has no lambda input slot for its typed arc`,
    );
  }
  return slot.name;
};

export const planTransitionFiring = (options: {
  transition: Transition;
  inputs: readonly ArcPlace<InputArc>[];
  sdcpn: SDCPN;
  profile: GpuNetProfile;
  layout: StateLayout;
  placeIndexById: ReadonlyMap<string, number>;
  discreteTypesByPlaceId: ReadonlyMap<
    string,
    ReadonlyMap<string, DiscreteType>
  >;
  extensions: PetrinautExtensionSettings | undefined;
}): TransitionFiring => {
  const { transition, inputs, sdcpn, profile, layout, extensions } = options;

  const guards: string[] = inputs.map(({ arc, placeIndex }) =>
    arc.type === "inhibitor"
      ? `counts[${placeIndex}u] < ${arc.weight}u`
      : `counts[${placeIndex}u] >= ${arc.weight}u`,
  );
  const capacityConstraints = computeTransitionCapacityConstraints({
    transition,
    placeIndexById: options.placeIndexById,
    // The declared limit, not the slot allocation: an uncoloured place has no
    // slots but may still be capped, and the CPU path enforces that cap.
    placeCapacities: Uint32Array.from(
      profile.places.map((place) => place.declaredCapacity),
    ),
  });
  for (const constraint of capacityConstraints) {
    // `pending` is signed so a place that both gained and lost tokens this
    // frame nets out correctly before the comparison.
    guards.push(
      `(i32(counts[${constraint.placeIndex}u]) + pending[${constraint.placeIndex}u] + ${constraint.delta}) <= ${constraint.capacity}`,
    );
  }

  const typedInputs = inputs.filter(
    ({ arc, placeIndex }) =>
      arc.type === "standard" && (profile.places[placeIndex]?.colored ?? false),
  );
  if (typedInputs.length > 1) {
    throw new WgslBailError(
      `transition \`${transition.name}\` consumes typed tokens from ${typedInputs.length} places; only one is supported`,
    );
  }
  const typedInput = typedInputs[0];
  if (typedInput !== undefined && typedInput.arc.weight > 2) {
    throw new WgslBailError(
      `transition \`${transition.name}\` consumes ${typedInput.arc.weight} tokens from \`${typedInput.placeId}\`; at most two per place are supported`,
    );
  }
  const typedWeight = typedInput?.arc.weight ?? 0;
  const selectionVars =
    typedWeight === 2 ? ["sel_0", "sel_1"] : typedWeight === 1 ? ["sel_0"] : [];

  const tokenSlots = new Map<string, readonly TokenReader[]>();
  const selectionTokenSlots = new Map<string, readonly TokenReader[]>();
  if (typedInput !== undefined) {
    const place = profile.places[typedInput.placeIndex]!;
    const slotName = lambdaSlotName(transition, sdcpn, extensions);
    const discreteTypes =
      options.discreteTypesByPlaceId.get(place.id) ?? new Map();
    const readersOver = (indexVars: readonly string[]) =>
      indexVars.map((indexVar) =>
        makeTokenReader(
          place,
          discreteTypes,
          tokenSlotExpr(layout, typedInput.placeIndex, indexVar),
        ),
      );
    // One reader per token the arc consumes, in the order the lambda
    // destructures them: `const [a, b] = tokens.Space`.
    tokenSlots.set(
      slotName,
      readersOver(typedWeight === 2 ? ["cand_i", "cand_j"] : ["cand_0"]),
    );
    selectionTokenSlots.set(slotName, readersOver(selectionVars));
  }

  return {
    inputs,
    enabledCondition: guards.length > 0 ? guards.join(" && ") : "true",
    scanPlaceIndex: typedInput?.placeIndex ?? null,
    typedWeight,
    selectionVars,
    tokenSlots,
    selectionTokenSlots,
  };
};

/**
 * Reads a transition's lambda as a WGSL boolean-or-rate expression.
 *
 * Lambda HIR takes `(tokens, parameters)`; `tokenSlots` binds `tokens` with
 * one reader per token the arc consumes, so a lambda that reads attributes
 * of an uncoloured place bails.
 */
const emitLambda = (
  fn: HirFunction,
  parameterValues: Readonly<Record<string, WgslParameterValue>>,
  tokenSlots: ReadonlyMap<string, readonly TokenReader[]>,
): { statements: string[]; expression: string; isPredicate: boolean } => {
  const emitter = new WgslEmitter({
    parameterValues,
    randomCall: "rng_next_f32(&rng_state)",
  });
  const env = new Map<string, WgslValue>();
  const tokensParam = fn.params[0];
  if (tokensParam) {
    env.set(tokensParam.name, tokenSlotsValue(tokenSlots));
  }

  const value = emitter.emit(fn.body, env);
  if (value.kind === "bool") {
    return {
      statements: [...emitter.statements],
      expression: value.code,
      isPredicate: true,
    };
  }
  return {
    statements: [...emitter.statements],
    expression: emitter.f32(value),
    isPredicate: false,
  };
};

/**
 * Emits the firing decision inside the transition block, after
 * `structurally_enabled`: declares the `sel_*` slots, scans candidates when
 * there is a lambda, and returns the WGSL condition under which the
 * transition fires.
 */
export const emitFiringChoice = (
  push: (line: string) => void,
  firing: TransitionFiring,
  lambda: HirFunction | undefined,
  parameterValues: Readonly<Record<string, WgslParameterValue>>,
): { fireCondition: string; compiledLambda: boolean } => {
  const { typedWeight, scanPlaceIndex, selectionVars, tokenSlots } = firing;

  // Declared whether or not there is a lambda: a typed-input transition with
  // no lambda still consumes tokens, and the CPU takes combination 0 then.
  for (const selectionVar of selectionVars) {
    push(`      var ${selectionVar}: u32 = 0u;`);
  }
  if (typedWeight === 2) {
    // Combination 0 of `indexCombinations(n, 2)` is the pair (0, 1).
    push(`      sel_1 = 1u;`);
  }

  if (lambda === undefined) {
    // No lambda: always enabled once structure permits, the CPU's default.
    return { fireCondition: "structurally_enabled", compiledLambda: false };
  }

  const emitted = emitLambda(lambda, parameterValues, tokenSlots);
  push(`      var fires = false;`);
  push(`      if (structurally_enabled) {`);

  // The CPU draws its acceptance uniform once per enabled transition per
  // frame, before walking combinations, reuses it for every one, and consumes
  // it whether or not the transition fires (`monte-carlo/transition-effect.ts`).
  // Drawing inside the scan would give a place holding more tokens more
  // chances to clear the threshold; not consuming the draw would accumulate
  // the hazard over the idle window instead of testing a memoryless
  // per-frame Bernoulli over dt.
  const isStochastic = !emitted.isPredicate;
  if (isStochastic) {
    push(`        let u = rng_next_f32(&rng_state);`);
  }
  const acceptance = isStochastic
    ? `accepts_firing(${emitted.expression}, DT, u)`
    : emitted.expression;

  if (typedWeight === 2) {
    // The readers already name `cand_i` and `cand_j`, which the scan declares.
    for (const line of emitPairScanWgsl({
      tokenCountExpr: `counts[${scanPlaceIndex!}u]`,
      emitAccepts: () => ({
        statements: emitted.statements,
        expression: acceptance,
      }),
      firedVar: "fires",
      firstVar: "sel_0",
      secondVar: "sel_1",
      indent: "        ",
    })) {
      push(line);
    }
  } else if (typedWeight === 1) {
    push(
      `        for (var cand_0: u32 = 0u; cand_0 < counts[${scanPlaceIndex!}u]; cand_0 = cand_0 + 1u) {`,
    );
    for (const statement of emitted.statements) {
      push(`          ${statement}`);
    }
    push(`          fires = ${acceptance};`);
    push(`          if (fires) { sel_0 = cand_0; break; }`);
    push(`        }`);
  } else {
    for (const statement of emitted.statements) {
      push(`        ${statement}`);
    }
    push(`        fires = ${acceptance};`);
  }

  push(`      }`);
  return { fireCondition: "fires", compiledLambda: true };
};

/**
 * Emits the consumption inside the fire block: compacts the chosen tokens out
 * of the scanned place and decrements every standard input's count.
 *
 * Compaction is stable, matching `monte-carlo/frame-operations.ts`: survivors
 * keep their relative order and shift down into the gaps. A swap-remove would
 * reorder the array, so later frames would enumerate candidates in a
 * different order and consume different tokens — divergence, not noise.
 */
export const emitConsumption = (
  push: (line: string) => void,
  firing: TransitionFiring,
  layout: StateLayout,
  profile: GpuNetProfile,
): void => {
  const { scanPlaceIndex, typedWeight, selectionVars } = firing;
  if (scanPlaceIndex !== null) {
    const stride = layout.placeTokenStrides[scanPlaceIndex]!;
    const tokenBase = layout.placeTokenOffsets[scanPlaceIndex]!;
    // Nothing below `sel_0` moves, so the sweep starts past it and only the
    // higher chosen slots need skipping.
    const skipped = selectionVars
      .slice(1)
      .map((selectionVar) => `m == ${selectionVar}`)
      .join(" || ");
    push(
      `        // consume ${typedWeight} token(s) from ${commentSafe(profile.places[scanPlaceIndex]!.name)}`,
    );
    push(`        var write_slot: u32 = sel_0;`);
    push(
      `        for (var m: u32 = sel_0 + 1u; m < counts[${scanPlaceIndex}u]; m = m + 1u) {`,
    );
    if (skipped !== "") {
      push(`          if (${skipped}) { continue; }`);
    }
    push(`          let src = base + ${tokenBase}u + m * ${stride}u;`);
    push(`          let dst = base + ${tokenBase}u + write_slot * ${stride}u;`);
    push(`          if (dst != src) {`);
    push(`            for (var w: u32 = 0u; w < ${stride}u; w = w + 1u) {`);
    push(`              state[dst + w] = state[src + w];`);
    push(`            }`);
    push(`          }`);
    push(`          write_slot = write_slot + 1u;`);
    push(`        }`);
  }
  for (const { arc, placeIndex } of firing.inputs) {
    if (arc.type !== "standard") {
      continue;
    }
    push(
      `        counts[${placeIndex}u] = counts[${placeIndex}u] - ${arc.weight}u;`,
    );
  }
};
