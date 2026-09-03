/**
 * Measures how per-frame cost scales with token count for a transition whose
 * coloured input arc has weight 2.
 *
 * Three cases bound the enumeration cost. With a lambda that reads token
 * attributes: a transition that never fires examines every combination each
 * frame (O(C(n, 2)) lambda evaluations — irreducible), and one that always
 * fires examines one. Lazy enumeration makes both allocation-free; the eager
 * implementation it replaced also materialised the full C(n, 2) combination
 * list per evaluation, which made even the always-fires case quadratic.
 * With a token-independent lambda, the artifact carries
 * `readsNoInputTokens` and the engine tests only the first combination, so
 * even the never-fires case is O(1) per frame.
 */
import { performance } from "node:perf_hooks";

const DIST = "../dist";

const { createMonteCarloSimulator } = await import(`${DIST}/index.js`);
const { compileHirArtifacts } = await import(`${DIST}/hir.js`);

/** Net: one coloured place `pool`, one transition consuming 2 pool tokens. */
const sdcpn = {
  types: [
    {
      id: "t-item",
      name: "Item",
      iconSlug: "circle",
      displayColor: "#00FF00",
      elements: [{ elementId: "v", name: "v", type: "real" }],
    },
  ],
  places: [
    {
      id: "pool",
      name: "Pool",
      colorId: "t-item",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "sink",
      name: "Sink",
      colorId: "t-item",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 100,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "pair",
      name: "Pair",
      inputArcs: [{ placeId: "pool", weight: 2, type: "standard" }],
      outputArcs: [{ placeId: "sink", weight: 1 }],
      lambdaType: "predicate",
      // Never fires, so token counts stay constant and we measure pure
      // enablement/enumeration cost at a fixed marking size. Reads a token
      // attribute so the lambda is NOT token-independent — every combination
      // must be examined.
      lambdaCode: "export default Lambda((input) => input.Pool[0].v < 0);",
      transitionKernelCode:
        "export default TransitionKernel(() => ({ Sink: [{ v: 1 }] }));",
      x: 50,
      y: 0,
    },
  ],
  differentialEquations: [],
  parameters: [],
};

/**
 * The always-fires variant: a self loop that consumes two pool tokens and
 * produces two, so the marking size stays constant while the transition fires
 * on the first combination every frame.
 */
const selfLoopSdcpn = {
  ...sdcpn,
  transitions: [
    {
      ...sdcpn.transitions[0],
      inputArcs: [{ placeId: "pool", weight: 2, type: "standard" }],
      outputArcs: [{ placeId: "pool", weight: 2 }],
      lambdaCode: "export default Lambda((input) => input.Pool[0].v >= 0);",
      transitionKernelCode:
        "export default TransitionKernel(() => ({ Pool: [{ v: 1 }, { v: 2 }] }));",
    },
  ],
};

/**
 * A token-independent never-firing lambda: the compiler flags it, and the
 * engine tests only the first combination — O(1) per frame regardless of
 * token count.
 */
const tokenIndependentSdcpn = {
  ...sdcpn,
  transitions: [
    {
      ...sdcpn.transitions[0],
      lambdaCode: "export default Lambda(() => false);",
    },
  ],
};

function measure(net, artifacts, tokens) {
  const simulator = createMonteCarloSimulator({
    sdcpn: net,
    initialMarking: {
      pool: Array.from({ length: tokens }, (_, index) => ({ v: index })),
      sink: [],
    },
    parameterValues: {},
    seed: 1,
    dt: 0.1,
    maxTime: 5,
    runCount: 20,
    hirArtifacts: artifacts,
    metrics: [],
  });

  const start = performance.now();
  simulator.runUntilComplete();
  const ms = performance.now() - start;

  let frames = 0;
  for (const summary of simulator.getSummaries()) {
    frames += summary.frameNumber;
  }
  return (ms / frames) * 1e6;
}

const cases = [
  ["token-reading lambda, never fires (examines every combination)", sdcpn],
  [
    "token-reading lambda, always fires (examines one combination)",
    selfLoopSdcpn,
  ],
  [
    "token-independent lambda, never fires (first combination only)",
    tokenIndependentSdcpn,
  ],
];

for (const [label, net] of cases) {
  const artifacts = compileHirArtifacts(net).artifacts;
  process.stdout.write(
    `weight-2 coloured arc, ${label}\n` + "tokens   C(n,2)      ns/run-frame\n",
  );
  for (const tokens of [10, 25, 50, 100, 200, 400]) {
    const combinations = (tokens * (tokens - 1)) / 2;
    process.stdout.write(
      `${String(tokens).padStart(6)}   ${String(combinations).padStart(7)}   ` +
        `${measure(net, artifacts, tokens).toFixed(0).padStart(12)}\n`,
    );
  }
  process.stdout.write("\n");
}
