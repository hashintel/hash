import { describe, expect, it } from "vitest";

import { probabilisticSatellitesSDCPN } from "../examples/satellites-launcher";
import { sirModel } from "../examples/sir-model";
import { compileHirArtifacts } from "../hir";
import { resolveNetParameterValues } from "../parameter-values";
import { compileNetShader } from "./compile-net-shader";
import { assessGpuEligibility } from "./eligibility";
import { hirFromArtifacts } from "./hir-from-artifacts";

import type { SDCPN } from "../types/sdcpn";
import type { GpuOdeMethod } from "./compile-net-shader";

function compileFor(
  sdcpn: SDCPN,
  {
    odeMethod = "rk4",
    metrics = [] as { id: string; placeId: string }[],
    dt = 0.1,
    framesPerDispatch = 300,
    runParameters,
  }: {
    odeMethod?: GpuOdeMethod;
    metrics?: { id: string; placeId: string }[];
    dt?: number;
    framesPerDispatch?: number;
    runParameters?: readonly string[];
  } = {},
) {
  const eligibility = assessGpuEligibility(sdcpn);
  if (!eligibility.eligible) {
    throw new Error(
      `net not eligible: ${eligibility.reasons.map((r) => r.code).join(", ")}`,
    );
  }
  const lowered = hirFromArtifacts(
    sdcpn,
    compileHirArtifacts(sdcpn, undefined, { includeHir: true }).artifacts,
  );
  return compileNetShader({
    sdcpn,
    profile: eligibility.profile,
    parameterValues: resolveNetParameterValues(sdcpn.parameters, {}, true),
    lambdaHir: lowered.lambdas,
    dynamicsHir: lowered.dynamics,
    kernelHir: lowered.kernels,
    dt,
    framesPerDispatch,
    metrics,
    odeMethod,
    ...(runParameters === undefined ? {} : { runParameters }),
  });
}

const sir = sirModel.petriNetDefinition;
const satellites = probabilisticSatellitesSDCPN.petriNetDefinition;

describe("per-run parameters", () => {
  it("reads a swept parameter from the per-run buffer and keeps the rest inlined", () => {
    const result = compileFor(sir, { runParameters: ["infection_rate"] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shader.runParameterIds).toEqual(["infection_rate"]);
    expect(result.shader.wgsl).toContain(
      "@group(0) @binding(4) var<storage, read> run_params: array<f32>;",
    );
    expect(result.shader.wgsl).toContain(
      "run_param_0 = run_params[run_index * 1u + 0u];",
    );
    // The swept parameter reads the hoisted per-run value...
    expect(result.shader.wgsl).toContain("run_param_0");
    // ...while the fixed one stays a literal (recovery_rate defaults to 1).
    expect(result.shader.wgsl).toContain("1.0");
  });

  it("lays several swept parameters out run-major in declaration order", () => {
    const result = compileFor(sir, {
      runParameters: ["infection_rate", "recovery_rate"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shader.wgsl).toContain(
      "run_param_0 = run_params[run_index * 2u + 0u];",
    );
    expect(result.shader.wgsl).toContain(
      "run_param_1 = run_params[run_index * 2u + 1u];",
    );
  });

  it("declares no per-run binding when nothing varies per run", () => {
    const result = compileFor(sir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shader.runParameterIds).toEqual([]);
    expect(result.shader.wgsl).not.toContain("run_params");
  });

  it("refuses a per-run parameter the net does not declare", () => {
    const result = compileFor(sir, { runParameters: ["not_a_parameter"] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("not a parameter of this net");
  });
});

describe("compileNetShader", () => {
  it("compiles the uncoloured SIR net", () => {
    const result = compileFor(sir);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 counts + 2 firings + rng + status.
    expect(result.shader.stateWordsPerRun).toBe(7);
    expect(result.shader.compiledLambdas).toStrictEqual([
      "transition__infection",
      "transition__recovery",
    ]);
  });

  it("declares one invocation-per-run entry point", () => {
    const result = compileFor(sir);
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).toContain("@compute @workgroup_size(256)");
    expect(result.shader.wgsl).toContain("fn step_runs(");
    // The frame loop must be inside the shader; a host-driven per-frame dispatch
    // would cost more in readback than the work itself.
    expect(result.shader.wgsl).toContain(
      "for (var frame: u32 = 0u; frame < config.chunk_frames;",
    );
  });

  it("consumes the acceptance draw every enabled frame, fired or not", () => {
    // This mirrors the CPU engine, where `advance-run.ts` commits the run's
    // RNG state after every transition evaluation ("Every evaluation's
    // randomness is consumed, fired or not") and the acceptance is a
    // memoryless per-frame Bernoulli over dt. Holding the draw until it
    // fires accumulated the hazard over a transition's idle window instead —
    // structurally divergent for any intermittently enabled net.
    const result = compileFor(sir);
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).toContain("let u = rng_next_f32(&rng_state);");
    expect(result.shader.wgsl).not.toContain("rng_candidate");
    expect(result.shader.wgsl).toContain("accepts_firing");
  });

  it("applies removals immediately and additions at end of frame", () => {
    const result = compileFor(sir);
    if (!result.ok) throw new Error(result.reason);
    const wgsl = result.shader.wgsl;

    // Infection consumes one Susceptible immediately...
    expect(wgsl).toContain("counts[0u] = counts[0u] - 1u;");
    // ...but its two Infected outputs are deferred, so a later transition in the
    // same frame cannot consume them.
    expect(wgsl).toContain("pending[1u] = pending[1u] + 2;");
    expect(wgsl).toContain(
      "counts[1u] = u32(max(0, i32(counts[1u]) + pending[1u]));",
    );
  });

  it("marks a run deadlocked only when nothing fired and nothing is enabled", () => {
    const result = compileFor(sir);
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).toContain(
      "if (!any_fired && !any_enabled) { status = 1u; }",
    );
  });

  it.each([
    ["euler", 1],
    ["rk2", 2],
    ["rk4", 4],
  ] as const)("emits %s with %i derivative stages", (odeMethod, stages) => {
    // A place whose token carries a real attribute with a differential equation.
    const net: SDCPN = {
      types: [
        {
          id: "c",
          name: "Item",
          iconSlug: "circle",
          displayColor: "#0f0",
          elements: [{ elementId: "v", name: "v", type: "real" }],
        },
      ],
      places: [
        {
          id: "pool",
          name: "Pool",
          colorId: "c",
          capacity: 4,
          dynamicsEnabled: true,
          differentialEquationId: "eq",
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "t",
          name: "T",
          inputArcs: [],
          outputArcs: [],
          lambdaType: "predicate",
          lambdaCode: "export default Lambda(() => false);",
          transitionKernelCode: "export default TransitionKernel(() => ({}));",
          x: 0,
          y: 0,
        },
      ],
      differentialEquations: [
        {
          id: "eq",
          name: "decay",
          colorId: "c",
          code: "export default Dynamics((tokens) => tokens.map((token) => ({ v: -token.v })));",
        },
      ],
      parameters: [],
    };

    const result = compileFor(net, { odeMethod });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const wgsl = result.shader.wgsl;
    for (let stage = 1; stage <= stages; stage++) {
      expect(wgsl).toContain(`k${stage}_0`);
    }
    expect(wgsl).not.toContain(`k${stages + 1}_0`);
    // RK4's four stages live in one invocation because a token's derivative
    // depends only on that token — no extra dispatch, no shared memory.
    if (odeMethod === "rk4") {
      expect(wgsl).toContain(
        "(DT / 6.0) * (k1_0 + 2.0 * k2_0 + 2.0 * k3_0 + k4_0)",
      );
    }
  });

  it("reduces metrics in workgroup memory rather than global atomics", () => {
    const result = compileFor(sir, {
      metrics: [{ id: "infected", placeId: "place__infected" }],
    });
    if (!result.ok) throw new Error(result.reason);
    const wgsl = result.shader.wgsl;

    // Measured 2x faster than hitting global atomics directly, because runs in a
    // workgroup collide on the same bin constantly.
    expect(wgsl).toContain("var<workgroup> local_hist");
    expect(wgsl).toContain("atomicAdd(&local_hist[");
    expect(wgsl).toContain("workgroupBarrier();");
    expect(result.shader.metricIds).toStrictEqual(["infected"]);
  });

  it("emits no histogram machinery when there are no metrics", () => {
    const result = compileFor(sir);
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).not.toContain("local_hist");
  });

  it("reports a reason rather than throwing when a metric names an unknown place", () => {
    const result = compileFor(sir, {
      metrics: [{ id: "m", placeId: "does-not-exist" }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/unknown place/);
  });

  it("inlines dt as the f32 the device will hold", () => {
    const result = compileFor(sir, { dt: 0.1 });
    if (!result.ok) throw new Error(result.reason);

    expect(result.shader.wgsl).toContain(
      "const DT: f32 = 0.10000000149011612;",
    );
  });
});

/**
 * The host reads a run's RNG state and status out of the state buffer by word
 * offset. Those offsets used to be derived by counting back from
 * `stateWordsPerRun`, which is only correct for a net with no token attributes:
 * the layout is `counts | firings | rng | status | tokens`, so on a
 * typed net the seed landed in a token attribute and the status came out of the
 * token array — leaving every run sharing one RNG stream while reporting
 * confidently. These pin the offsets against the shader's own writes.
 */
describe("state layout offsets", () => {
  /** A typed place with one real attribute, so the layout has token words. */
  const typedNet = (): SDCPN => ({
    ...sir,
    types: [
      {
        id: "type__tank",
        name: "Tank",
        iconSlug: "circle",
        displayColor: "#3366ff",
        elements: [{ elementId: "el__level", name: "level", type: "real" }],
      },
    ],
    places: sir.places.map((place, index) =>
      index === 0 ? { ...place, colorId: "type__tank", capacity: 4 } : place,
    ),
  });

  const statusWriteOffset = (wgsl: string): number =>
    Number(/state\[base \+ (\d+)u\] = status;/.exec(wgsl)![1]);
  const rngWriteOffset = (wgsl: string): number =>
    Number(/state\[base \+ (\d+)u\] = rng_state;/.exec(wgsl)![1]);

  it("matches where the shader writes them, for an uncoloured net", () => {
    const compiled = compileFor(sir);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }

    expect(compiled.shader.statusOffset).toBe(
      statusWriteOffset(compiled.shader.wgsl),
    );
    expect(compiled.shader.rngOffset).toBe(
      rngWriteOffset(compiled.shader.wgsl),
    );
  });

  it("matches where the shader writes them once token attributes exist", () => {
    const compiled = compileFor(typedNet());
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    const { rngOffset, statusOffset, stateWordsPerRun } = compiled.shader;

    expect(statusOffset).toBe(statusWriteOffset(compiled.shader.wgsl));
    expect(rngOffset).toBe(rngWriteOffset(compiled.shader.wgsl));

    // And the old derivation would have been wrong here, which is the whole
    // point: token words sit after the status word.
    expect(statusOffset).not.toBe(stateWordsPerRun - 1);
    expect(rngOffset).not.toBe(stateWordsPerRun - 2);
  });
});

/**
 * A weight-1 typed input arc means the transition *chooses* a token, and the CPU
 * chooses by walking `indexCombinations(n, 1)` and firing on the first passing
 * candidate. These pin the two halves of that: reading the candidate's attributes,
 * and removing exactly the chosen token afterwards.
 */
describe("typed token consumption", () => {
  const crashNet = (): SDCPN => ({
    ...satellites,
    places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
    transitions: satellites.transitions.filter(
      (transition) => transition.name === "Crash",
    ),
  });

  const crashWgsl = (): string => {
    const compiled = compileFor(crashNet());
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    return compiled.shader.wgsl;
  };

  it("reads the candidate token's attributes from its own slot", () => {
    const wgsl = crashWgsl();

    // Same slot arithmetic the dynamics loop uses, indexed by the candidate
    // rather than by a full sweep.
    expect(wgsl).toMatch(
      /bitcast<f32>\(state\[\(base \+ \d+u \+ cand_0 \* \d+u\) \+ 0u\]\)/,
    );
  });

  it("stops at the first passing candidate, as the CPU does", () => {
    const wgsl = crashWgsl();

    expect(wgsl).toMatch(/for \(var cand_0: u32 = 0u; cand_0 < counts\[\d+u\]/);
    expect(wgsl).toMatch(/if \(fires\) \{ sel_0 = cand_0; break; \}/);
  });

  it("draws the acceptance uniform once, outside the candidate scan", () => {
    // `Crash` is a predicate, so it never draws. A *stochastic* typed lambda does,
    // and the CPU draws once per transition per frame and reuses it for every
    // candidate — drawing inside the scan would give a place holding more tokens
    // more chances to fire, so it would fire measurably sooner.
    const net = crashNet();
    const stochastic: SDCPN = {
      ...net,
      transitions: net.transitions.map((transition) => ({
        ...transition,
        lambdaType: "stochastic" as const,
        lambdaCode:
          "export default Lambda((tokens) => 1.0 / (1.0 + tokens.Space[0].velocity))",
      })),
    };

    const compiled = compileFor(stochastic);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    const { wgsl } = compiled.shader;
    const drawIndex = wgsl.indexOf("let u = rng_next_f32(&rng_state);");
    const scanIndex = wgsl.indexOf("for (var cand_0:");

    expect(drawIndex).toBeGreaterThan(-1);
    expect(scanIndex).toBeGreaterThan(drawIndex);
  });

  it("compacts stably from the chosen slot, not by swapping the last token in", () => {
    // `monte-carlo/frame-operations.ts` shifts survivors down and preserves their
    // order. A swap-remove would reorder the array, so later frames would
    // enumerate candidates differently and consume different tokens.
    const wgsl = crashWgsl();

    expect(wgsl).toMatch(/for \(var m: u32 = sel_0 \+ 1u; m < counts\[\d+u\]/);
    expect(wgsl).toMatch(/var write_slot: u32 = sel_0;/);
    expect(wgsl).toMatch(/let dst = base \+ \d+u \+ write_slot \* \d+u;/);
    // No swap-in-from-the-end anywhere.
    expect(wgsl).not.toMatch(
      /counts\[\d+u\] - 1u\) \* \d+u;\s*\n\s*for \(var w/,
    );
  });

  it("declares the chosen slot even when the transition has no lambda", () => {
    // Without a lambda the CPU takes combination 0, so the compaction still runs
    // — and it references `sel_0`, which must therefore exist.
    const net = crashNet();
    const withoutLambda: SDCPN = {
      ...net,
      transitions: net.transitions.map((transition) => ({
        ...transition,
        lambdaCode: "",
      })),
    };

    const compiled = compileFor(withoutLambda);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    expect(compiled.shader.wgsl).toMatch(/var sel_0: u32 = 0u;/);
    expect(compiled.shader.wgsl).toMatch(/var m: u32 = sel_0 \+ 1u/);
  });
});

/**
 * A weight-2 typed arc consumes a *pair*, and the CPU chooses it by walking
 * `indexCombinations(n, 2)` and firing on the first passing one. The shader scans
 * the same order by unranking a flat index — see `pair-selection.ts`.
 */
describe("weight-2 typed token consumption", () => {
  const collisionWgsl = (): string => {
    const net: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
      transitions: satellites.transitions.filter(
        (transition) => transition.name === "Collision",
      ),
    };
    const compiled = compileFor(net);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    return compiled.shader.wgsl;
  };

  it("compiles a condition over both tokens of the pair", () => {
    const wgsl = collisionWgsl();

    // `const [a, b] = tokens.Space` binds a to the first leg and b to the second,
    // so both candidate variables must appear in the distance computation.
    expect(wgsl).toMatch(/cand_i \* \d+u/);
    expect(wgsl).toMatch(/cand_j \* \d+u/);
  });

  it("scans pairs by unranking a flat index, in the engine's order", () => {
    const wgsl = collisionWgsl();

    expect(wgsl).toMatch(
      /let pair_total = select\(0u, pair_n \* \(pair_n - 1u\)/,
    );
    expect(wgsl).toMatch(
      /let cand_j = x - \(cand_i \* \(pair_a_u - cand_i\)\)/,
    );
    expect(wgsl).toMatch(/sel_0 = cand_i;/);
    expect(wgsl).toMatch(/sel_1 = cand_j;/);
  });

  it("binds tokens[0] to the lower leg of the pair", () => {
    // `const [a, b] = tokens.Space` must put `a` on cand_i. A symmetric condition
    // like distance(a, b) would hide a swap, so this reads only index 0.
    const net: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
      transitions: satellites.transitions
        .filter((transition) => transition.name === "Collision")
        .map((transition) => ({
          ...transition,
          lambdaType: "predicate" as const,
          lambdaCode:
            "export default Lambda((tokens) => tokens.Space[0].x < 1)",
        })),
    };
    const compiled = compileFor(net);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }

    expect(compiled.shader.wgsl).toMatch(/cand_i \* \d+u\) \+ 0u\]/);
    expect(compiled.shader.wgsl).not.toMatch(/cand_j \* \d+u\) \+ 0u\]/);
  });

  it("defaults to the pair (0, 1), which is combination zero", () => {
    // With no condition to fail the CPU consumes combination 0. `sel_1` therefore
    // cannot be left at its zero initialiser, which would pair a token with itself.
    expect(collisionWgsl()).toMatch(/sel_1 = 1u;/);
  });

  it("compacts both consumed slots, skipping only the higher one", () => {
    const wgsl = collisionWgsl();

    expect(wgsl).toMatch(/if \(m == sel_1\) \{ continue; \}/);
    // The sweep already starts past sel_0, so re-testing it would be dead code.
    expect(wgsl).not.toMatch(/m == sel_0 \|\|/);
    expect(wgsl).toMatch(/counts\[0u\] = counts\[0u\] - 2u;/);
  });
});

/**
 * A transition kernel writes the attributes of the tokens a firing produces. The
 * ordering is the subtle part: a kernel reads the tokens the firing *consumes*,
 * and compaction overwrites those slots.
 */
describe("transition kernels", () => {
  const crashNet = (): SDCPN => ({
    ...satellites,
    places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
    transitions: satellites.transitions.filter(
      (transition) => transition.name === "Crash",
    ),
  });

  const crashWgsl = (): string => {
    const compiled = compileFor(crashNet());
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    return compiled.shader.wgsl;
  };

  it("reads the consumed token before compaction overwrites its slot", () => {
    // The emitter hoists only the subexpressions it names, so `x: tokens.Space[0].x`
    // would otherwise stay inline in the write and execute after compaction had
    // moved a survivor into that slot — silently the wrong token's attributes.
    const wgsl = crashWgsl();
    const hoistIndex = wgsl.indexOf("let kout_0: u32 =");
    const compactIndex = wgsl.indexOf("var write_slot: u32 = sel_0;");
    const writeIndex = wgsl.indexOf("state[out + 0u] = kout_0;");

    expect(hoistIndex).toBeGreaterThan(-1);
    expect(compactIndex).toBeGreaterThan(hoistIndex);
    expect(writeIndex).toBeGreaterThan(compactIndex);
  });

  it("writes produced tokens above the live count, so nothing consumes them this frame", () => {
    // Mirrors the CPU, which defers additions to after its transition loop while
    // tracking the count in `pendingOutputCounts`.
    expect(crashWgsl()).toMatch(
      /let out = base \+ \d+u \+ \(counts\[\d+u\] \+ u32\(max\(0, pending\[\d+u\]\)\)/,
    );
  });

  it("refuses a typed output whose kernel has no HIR rather than zeroing it", () => {
    // Writing nothing would leave every attribute at zero and report that as a
    // result, which is the failure mode this replaced.
    const eligibility = assessGpuEligibility(crashNet());
    if (!eligibility.eligible) {
      throw new Error("fixture should be eligible");
    }
    const lowered = hirFromArtifacts(
      crashNet(),
      compileHirArtifacts(crashNet(), undefined, { includeHir: true })
        .artifacts,
    );
    const compiled = compileNetShader({
      sdcpn: crashNet(),
      profile: eligibility.profile,
      parameterValues: resolveNetParameterValues(
        crashNet().parameters,
        {},
        true,
      ),
      lambdaHir: lowered.lambdas,
      dynamicsHir: lowered.dynamics,
      // Deliberately omitted.
      kernelHir: new Map(),
      dt: 0.1,
      framesPerDispatch: 8,
      metrics: [],
      odeMethod: "rk4",
    });

    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.reason).toMatch(/carried no HIR/);
  });
});

/**
 * Same-scope `let`/`var` redeclarations, which is what naga reports and what a
 * text assertion cannot see. Shadowing an outer scope is legal WGSL, so only the
 * innermost scope is checked.
 *
 * Calibrated against a real validator: on the emitter as it stood before the
 * per-stage identifier scope, this reported exactly the twelve findings naga did
 * for RK4 (`u_0_mu`, `u_1_r`, `u_2_ax`, `u_3_ay`, three times over), and none of
 * the `structurally_enabled` or `kout_N` repeats, which live in sibling blocks.
 */
function sameScopeRedeclarations(wgsl: string): string[] {
  const found: string[] = [];
  const stack: Set<string>[] = [new Set()];
  for (const [index, line] of wgsl.split("\n").entries()) {
    const declaration = /(?:^|\s)(?:let|var)\s+(\w+)/u.exec(line);
    if (declaration) {
      const scope = stack.at(-1)!;
      const name = declaration[1]!;
      if (scope.has(name)) {
        found.push(`line ${index + 1}: redeclaration of '${name}'`);
      }
      scope.add(name);
    }
    for (const character of line) {
      if (character === "{") {
        stack.push(new Set());
      } else if (character === "}" && stack.length > 1) {
        stack.pop();
      }
    }
  }
  return found;
}

describe("generated WGSL validity", () => {
  const cappedSatellites = (): SDCPN => ({
    ...satellites,
    places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
  });

  // Every RK stage re-emits the same derivative HIR, and each emitter counts its
  // hoisted temporaries from zero. All of those statements land in one scope, so
  // the stage name has to reach the identifiers — the shader is otherwise
  // well-formed text that fails at `createShaderModule` with nothing upstream
  // noticing. `euler` has one stage and so never collided.
  it.each(["euler", "rk2", "rk4"] as const)(
    "declares each hoisted temporary once per scope with %s",
    (odeMethod) => {
      const compiled = compileFor(cappedSatellites(), { odeMethod });
      if (!compiled.ok) {
        throw new Error(compiled.reason);
      }

      expect(sameScopeRedeclarations(compiled.shader.wgsl)).toStrictEqual([]);
    },
  );

  it("keeps every stage's derivatives distinct rather than merging them", () => {
    // A scope prefix would also silence the redeclaration by making all four
    // stages write one name, which would compile and integrate the wrong
    // trajectory. Each stage must still contribute its own value.
    const compiled = compileFor(cappedSatellites(), { odeMethod: "rk4" });
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }

    for (const stage of ["k1", "k2", "k3", "k4"]) {
      expect(compiled.shader.wgsl).toContain(`let ${stage}_u_0_mu: f32`);
    }
  });
});

/**
 * The host reads a compact per-run summary instead of the run state. Run state is
 * dominated by the token array, which the host never decodes, and copying it into
 * a mappable buffer needs host-visible memory equal to the state — measured, that
 * capped a 3112-byte-per-run net at ~689k runs on hardware reporting a 4 GiB
 * `maxBufferSize`, and the failure surfaced three operations later as
 * "[Invalid Buffer] is invalid due to a previous error" from `mapAsync`.
 *
 * These offsets are an ABI between the generated WGSL and the host decoder, and
 * nothing else checks that the two agree.
 */
describe("run summary ABI", () => {
  const summaryFor = (sdcpn: SDCPN) => {
    const compiled = compileFor(sdcpn);
    if (!compiled.ok) {
      throw new Error(compiled.reason);
    }
    return compiled.shader;
  };

  it("writes one word per place plus the status", () => {
    const shader = summaryFor(sir);

    expect(shader.summaryWordsPerRun).toBe(shader.placeCountOffsets.length + 1);
    // Far smaller than the state it replaces, which is the entire point.
    expect(shader.summaryWordsPerRun).toBeLessThan(shader.stateWordsPerRun);
  });

  it("writes each place count at the index the host reads it from", () => {
    // The host indexes counts by place order, not by their offsets in run state.
    const shader = summaryFor(sir);

    for (let placeIndex = 0; placeIndex < 3; placeIndex++) {
      expect(shader.wgsl).toContain(
        `summary[summary_base + ${placeIndex}u] = counts[${placeIndex}u];`,
      );
    }
  });

  it("writes the status at the offset the type advertises", () => {
    // `summaryStatusOffset` is what the host adds to a run's base. If the shader
    // wrote it anywhere else the host would decode a place count as a status and
    // silently report every run as still running.
    const shader = summaryFor(sir);

    expect(shader.wgsl).toContain(
      `summary[summary_base + ${shader.summaryStatusOffset}u] = status;`,
    );
    expect(shader.summaryStatusOffset).toBe(shader.placeCountOffsets.length);
  });

  it("strides the summary by its own width, not the run state's", () => {
    const shader = summaryFor(sir);

    expect(shader.wgsl).toContain(
      `let summary_base = run_index * ${shader.summaryWordsPerRun}u;`,
    );
  });

  it("keeps the summary tiny on a typed net, where state is large", () => {
    // The satellites net at capacity 16 is 552 bytes of state per run; its
    // summary is 4 words. That ratio is what moves the run ceiling.
    const capped: SDCPN = {
      ...satellites,
      places: satellites.places.map((place) => ({ ...place, capacity: 16 })),
    };
    const shader = summaryFor(capped);

    expect(shader.summaryWordsPerRun * 20).toBeLessThan(
      shader.stateWordsPerRun,
    );
  });
});
