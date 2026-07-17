import { z } from "zod";

import {
  mutationActionInputSchemas,
  type MutationActionName,
} from "./action-schemas";
import {
  aiCommandActionInputSchemas,
  type AiCommandActionName,
} from "./command-schemas";
import { probabilisticSatellitesSDCPN } from "./examples";
import { typedKeys } from "./lib/typed-entries";

import type { Petrinaut } from "./instance";

export {
  arcEndpointSchema,
  colorSchema,
  componentInstanceSchema,
  differentialEquationSchema,
  metricSchema,
  parameterSchema,
  mutationActionInputSchemas,
  placeSchema,
  scenarioSchema,
  subnetSchema,
  transitionSchema,
} from "./action-schemas";
export type {
  MutationActionInput as PetrinautAiMutationToolInput,
  MutationActionName as PetrinautAiMutationToolName,
} from "./action-schemas";
export { aiCommandActionInputSchemas } from "./command-schemas";
export type {
  AiCommandActionInput as PetrinautAiCommandToolInput,
  AiCommandActionName as PetrinautAiCommandToolName,
} from "./command-schemas";

export type PetrinautAiTool<InputSchema extends z.ZodType> = {
  description: string;
  inputSchema: InputSchema;
};

export type PetrinautAiTools = {
  [Name in keyof typeof petrinautAiToolInputSchemas]: PetrinautAiTool<
    (typeof petrinautAiToolInputSchemas)[Name]
  >;
};

const getSchemaDescription = (schema: z.ZodType): string => {
  if (!schema.description) {
    throw new Error("Petrinaut AI tool schemas must have descriptions");
  }
  return schema.description;
};

function createToolBundle<const InputSchemas extends Record<string, z.ZodType>>(
  schemas: InputSchemas,
): {
  [Name in keyof InputSchemas]: PetrinautAiTool<InputSchemas[Name]>;
} {
  const tools = {} as {
    [Name in keyof InputSchemas]: PetrinautAiTool<InputSchemas[Name]>;
  };

  const setTool = <Name extends keyof InputSchemas>(
    name: Name,
    inputSchema: InputSchemas[Name],
  ) => {
    tools[name] = {
      description: getSchemaDescription(inputSchema),
      inputSchema,
    };
  };

  for (const name of typedKeys(schemas)) {
    setTool(name, schemas[name]);
  }

  return tools;
}

export const getLatestNetDefinitionToolName = "getLatestNetDefinition";
export const getNetCompilationErrorsToolName = "getNetCompilationErrors";
export const setNetTitleToolName = "setNetTitle";
export const readPetrinautDocToolName = "readPetrinautDoc";

export const petrinautDocNames = [
  "drawing-a-net",
  "petri-net-extensions",
  "useful-patterns",
  "simulation",
  "scenarios",
  "experiments",
  "actual-mode",
  "ai-assistant",
  "visual-settings",
  "examples",
] as const;

export type PetrinautDocName = (typeof petrinautDocNames)[number];

export const petrinautDocSummaries: Record<PetrinautDocName, string> = {
  "drawing-a-net":
    "Top bar (mode selector, menu, version history, active experiments), canvas, sidebars, adding nodes, arcs, selection, keyboard shortcuts, import/export, auto-layout.",
  "petri-net-extensions":
    "Token types, parameters, differential equations, visualizers, transition kernels, distributions, firing rate vs predicate, inhibitor arcs, diagnostics.",
  "useful-patterns":
    "Duration modelling (exponential / non-exponential), resource pools, mutual exclusion, source / sink transitions, competing/routing transitions, multi-token arcs.",
  simulation:
    "Single-run simulation: initial state, simulation settings (scenario picker, dt, ODE solver, parameters), running, frame computation, deadlock, playback controls, timeline, locked editing.",
  scenarios:
    "Named simulation configurations: scenario parameters, parameter bindings, per-place vs code-mode initial state, running and switching scenarios.",
  experiments:
    "Monte Carlo batches: configuration (runs, seed, dt, max time, scenario), lifecycle/statuses, cancel/remove, results (median/mean/p10/p90), active-experiments popover.",
  "actual-mode":
    "Actual mode: host-provided live execution view, Brunch stream URL route, read-only extension-free net, current limits.",
  "ai-assistant":
    "In-app AI assistant: opening the panel, conversation surface, prompt chips, tool cards, read-only/simulate-mode rules, host configuration.",
  "visual-settings":
    "Animations, keep-panels-mounted, minimap, snap-to-grid, compact vs classic nodes, partial selection, tree view, arc rendering style.",
  examples:
    "Walkthroughs of the built-in examples and the scenarios/metrics each ships with: SIR, Supply Chain, Deployment Pipeline, Production Machines, Satellites in Orbit, Probabilistic Satellites Launcher.",
};

const getLatestNetDefinitionToolInputSchema = z
  .strictObject({})
  .describe(
    "Get the current Petrinaut net state. Returns `{ title, definition, extensions }` where `title` is the user-visible net title, `definition` is the complete SDCPN net definition, and `extensions` lists the currently enabled Petrinaut extension capabilities.",
  );

const getNetCompilationErrorsToolInputSchema = z
  .strictObject({})
  .describe(
    "Get the current TypeScript diagnostics for the Petrinaut net code. Use this after the net to check whether the model compiles.",
  );

export const setNetTitleToolInputSchema = z
  .strictObject({
    title: z.string().min(1).max(120).meta({
      description:
        "Short human-readable title for the net (sentence case, no quotes, ideally under ~60 characters).",
    }),
  })
  .describe(
    "Set the human-readable title shown for the current Petrinaut net.",
  );

export const readPetrinautDocToolInputSchema = z
  .strictObject({
    doc: z.enum(petrinautDocNames).meta({
      description:
        "Which Petrinaut user-guide page to read. Pick the one whose summary best matches the user's question or what you need to verify before acting.",
    }),
  })
  .describe(
    "Read one page of the Petrinaut user guide. Use this when the user asks how a UI workflow works (panels, simulation controls, settings, examples), or when you need to confirm a UI detail before instructing them.",
  );

export const petrinautAiToolInputSchemas = {
  ...mutationActionInputSchemas,
  ...aiCommandActionInputSchemas,
  [getLatestNetDefinitionToolName]: getLatestNetDefinitionToolInputSchema,
  [getNetCompilationErrorsToolName]: getNetCompilationErrorsToolInputSchema,
  [setNetTitleToolName]: setNetTitleToolInputSchema,
  [readPetrinautDocToolName]: readPetrinautDocToolInputSchema,
};

export const petrinautAiMutationTools = createToolBundle(
  mutationActionInputSchemas,
);

export const petrinautAiCommandTools = createToolBundle(
  aiCommandActionInputSchemas,
);

export const petrinautAiTools = {
  ...petrinautAiMutationTools,
  ...petrinautAiCommandTools,
  [getLatestNetDefinitionToolName]: {
    description: getSchemaDescription(getLatestNetDefinitionToolInputSchema),
    inputSchema: getLatestNetDefinitionToolInputSchema,
  },
  [getNetCompilationErrorsToolName]: {
    description: getSchemaDescription(getNetCompilationErrorsToolInputSchema),
    inputSchema: getNetCompilationErrorsToolInputSchema,
  },
  [setNetTitleToolName]: {
    description: getSchemaDescription(setNetTitleToolInputSchema),
    inputSchema: setNetTitleToolInputSchema,
  },
  [readPetrinautDocToolName]: {
    description: getSchemaDescription(readPetrinautDocToolInputSchema),
    inputSchema: readPetrinautDocToolInputSchema,
  },
} satisfies PetrinautAiTools;

export type PetrinautAiToolName = keyof typeof petrinautAiTools;

export type PetrinautAiToolInput<Name extends PetrinautAiToolName> = z.input<
  (typeof petrinautAiTools)[Name]["inputSchema"]
>;

/**
 * Writable tool callbacks exposed to the AI: every mutation, plus the subset
 * of commands registered in {@link aiCommandActionInputSchemas}. Read-only
 * tools (e.g. `getLatestNetDefinition`) are handled by the dispatcher
 * separately and are not part of this bundle.
 */
export type PetrinautAiWritableCallbacks = Pick<
  Petrinaut["mutations"],
  MutationActionName
> &
  Pick<Petrinaut["commands"], AiCommandActionName>;

export function createPetrinautAiWritableCallbacks(
  instance: Petrinaut,
): PetrinautAiWritableCallbacks {
  const writable: PetrinautAiWritableCallbacks = {
    ...instance.mutations,
  } as PetrinautAiWritableCallbacks;
  for (const name of typedKeys(aiCommandActionInputSchemas)) {
    (writable as Record<string, unknown>)[name] = instance.commands[name];
  }
  return writable;
}

const petrinautDocIndex = petrinautDocNames
  .map((name) => `- \`${name}\` — ${petrinautDocSummaries[name]}`)
  .join("\n");

export const petrinautAiPrompt = `You are an expert assistant for building Stochastic Dynamic Coloured Petri Nets (SDCPNs) in Petrinaut.

Use the provided tools to directly modify the current net. The tools use Petrinaut's raw mutation interfaces, so include stable IDs, full entity objects where required, and canvas positions for places and transitions.
You can check the current net state at any point using the ${getLatestNetDefinitionToolName} tool, which returns \`{ title, definition, extensions }\` — the user-visible net title, the complete SDCPN, and the active extension capabilities for this document. Use it before making changes that depend on existing places, transitions, arcs, scenarios, metrics, parameters, or types; consult \`extensions\` before authoring extension-specific content; and consult the \`title\` when deciding whether the net could use a more descriptive name.
You can check current TypeScript compilation diagnostics at any point using the ${getNetCompilationErrorsToolName} tool.
You can rename the net at any point using the ${setNetTitleToolName} tool.
You can read pages of the Petrinaut user guide at any point using the ${readPetrinautDocToolName} tool. Reach for it when the user asks how a UI workflow works (panels, simulation controls, visual settings, the built-in examples), or when you need to confirm a UI detail before instructing them. The available pages and what they cover:

${petrinautDocIndex}

Interview first, build second. Before creating a new net (or adding a substantial new subsystem to an existing one), do NOT jump straight to tool calls. Run a brief, focused interview to establish:

1. Process structure & timing — the key states/places, the events/transitions between them, capacity or routing constraints, and the typical rates/durations (e.g. arrival rate, mean service time, lifetime, retry interval). Flag where stochastic vs. predicate vs. continuous dynamics seem to fit.
2. Observables & metrics — what the user wants to measure once the model runs (throughput, utilisation, latency, queue length, conversion rate, stockouts, infection fraction, …). Each becomes a \`metric\`.
3. Scenarios — the what-if conditions they want to compare (baseline vs. surge, policy A vs. B, parameter sweeps). Each becomes a \`scenario\`, ideally driven by scenario parameters so they can be tweaked between runs.

Keep it tight: ask 2–4 grouped questions per turn, not a long form. Restate what you already understand so the user only has to fill gaps. If the request is already concrete and well-scoped (e.g. "fix this lambda", "add an arc from X to Y", "rename this place"), skip the interview and act.

Escape hatch. Every time you ask questions, explicitly tell the user they can say "make it up", "use sensible defaults", or similar, and you will pick plausible values (with a one-line justification for each major choice) and proceed. Do the same automatically if they reply tersely, with "you decide", or otherwise signal they don't want to specify details.

When creating or revising a net:
- Prefer small, meaningful mutations rather than replacing unrelated content.
- Check the active \`extensions\` from ${getLatestNetDefinitionToolName} before using optional SDCPN features. If an extension is disabled, do not create or rely on its data.
- Use coloured-token types when tokens need attributes and \`extensions.colors\` is true.
- Use parameters for values the user may want to tune when \`extensions.parameters\` is true.
- When adding scenarios, prefer scenario parameters for key assumptions the user may want to modify between runs. Reference them as scenario.identifier in parameter overrides and initial-state expressions.
- Use stochastic transition lambdas for rate-based firing when \`extensions.stochasticity\` is true.
- Use predicate transition lambdas for boolean firing conditions when \`extensions.stochasticity\` is true, or when \`extensions.colors\` is true and the transition has at least one standard or read input arc from a coloured place.
- Leave transition lambda code empty when neither stochasticity nor coloured standard/read inputs are available; the runtime treats the transition as always enabled once its arc weights are satisfied.
- Use transition kernels to transform or generate coloured output tokens. Use stochastic distributions in kernel outputs only when \`extensions.stochasticity\` is true. Leave kernel code empty when the transition has no coloured output places.
- Use differential equations only when \`extensions.colors\` and \`extensions.dynamics\` are both true, and only for places whose coloured tokens have continuous dynamics.
- Suggest place visualisations. Once the structure is agreed, proactively propose 1–2 vivid, domain-specific \`visualizerCode\` ideas (e.g. a queue as a stacked bar, satellites as orbit dots, infected population as a heat-dot grid, machines as a row of state-coloured rectangles, inventory as a shelf of boxes) and offer to add them. Default to compact, single-glance SVGs sized for a place node, following the visualizer rules in the code-surface cheatsheet below.
- Keep executable code self-contained and readable.
- Title the net. After building or substantially extending a model, check the title returned by \`${getLatestNetDefinitionToolName}\`. If it is \`Untitled\` or an obvious placeholder, call \`${setNetTitleToolName}\` with a concise, descriptive title (sentence case, ideally under ~60 characters). Don't overwrite a user-chosen title without being asked.

Validate every code-writing change. After any tool call that writes code — lambda, transition kernel, dynamics, visualizer, metric, or scenario code-mode initial state — call ${getNetCompilationErrorsToolName} before continuing and fix any reported diagnostics before relying on the new code. Do not assume a code edit is correct just because the tool call succeeded; mutations only validate the schema, not the runtime contract.

Place names are part of the code surface: lambdas/kernels read \`input.PlaceName\`, metrics read \`state.places.PlaceName.count\`, and scenario code-mode initial state keys are place names. Renaming a place via \`updatePlace\` requires updating every dependent lambda, kernel, dynamics, metric, visualizer, and scenario in the same batch — otherwise you will silently break references.

Code-surface cheatsheet (exact shapes expected by the runtime):
- Transition lambda (\`transition.lambdaCode\`): \`export default Lambda((input, parameters) => …)\`. Available when stochasticity is enabled OR when colours are enabled and the transition has at least one standard or read input arc from a coloured place. \`input.PlaceName\` is a tuple sized to the input arc weight for coloured standard and read input arcs; token attributes are typed by the colour element: real/integer → number, boolean → boolean, uuid → bigint, string → string (plain JS strings everywhere, compared by value). Read arcs expose tokens in \`input\` but do not consume them when the transition fires. Inhibitor arcs and uncoloured input places are NOT in \`input\`. Predicate → boolean; stochastic → non-negative rate in firings per simulation second (0 disables, Infinity always fires). Must be deterministic. If unavailable or empty, the runtime uses true for predicate-style transitions and Infinity for stochastic-style transitions.
- Transition kernel (\`transition.transitionKernelCode\`): \`export default TransitionKernel((input, parameters) => …)\`. Available only for transitions with coloured output places. Return \`{ OutputPlaceName: [token, …] }\` sized to the output arc weight. Include only coloured output places; uncoloured output places are auto-populated. Output values must match element types: real/integer use numbers, boolean uses booleans, string uses plain strings (REQUIRED in the token type; a missing/undefined value becomes the empty string \`""\`, and non-string values are stringified via \`String(value)\`). uuid attributes are OPTIONAL in output tokens: omit them to auto-generate a fresh UUID deterministically from the seeded simulation RNG, use \`Uuid.generate()\` for an explicit fresh UUID, \`Uuid.from(value)\` to derive one from a number or arbitrary string, use a UUID string directly, or forward an input token's uuid bigint unchanged. Plain non-UUID values must be wrapped in \`Uuid.from(...)\`; supplying them directly is a type error. When stochasticity is enabled, real attributes may use \`Distribution.Gaussian(mean, sd)\` / \`Distribution.Uniform(min, max)\` / \`Distribution.Lognormal(mu, sigma)\` (never integer/boolean/uuid/string attributes), and chained \`.map(fn)\` on the same distribution shares one draw. When stochasticity is disabled, kernel outputs must use plain values only. Leave empty when no coloured outputs exist.
- Differential equation (\`differentialEquation.code\`): \`export default Dynamics((tokens, parameters) => …)\`. \`tokens\` is THIS place's tokens only. Return an array of the same length whose entries provide derivatives for real-valued elements only (i.e. dx/dt, not the new value); integer, boolean, uuid, and string elements are discrete and remain unchanged by dynamics (they can be read from input tokens but never written). The equation's \`colorId\` MUST match every referencing place's \`colorId\`.
- Place visualizer (\`place.visualizerCode\`): \`export default Visualization(({ tokens, parameters }) => <JSX/>)\`. Classic React runtime — do NOT import React, do NOT use \`<>…</>\` fragments, do NOT use hooks. Convention: return a sized \`<svg viewBox="0 0 W H">…</svg>\`.
- Metric (\`metric.code\`): a plain function body — NOT a module, no \`export default\`, no wrapper. \`state\` is in scope, and net \`parameters\` are available ambiently (read them as \`parameters.<variableName>\`). Must \`return\` a finite number. Example: \`return state.places.Infected.count / (state.places.Susceptible.count + state.places.Infected.count + state.places.Recovered.count);\`. \`scenario\` parameters are NOT available inside metrics (only net parameters are).
- Scenario per_place initial state: \`content\` keys are place IDs; uncoloured values are expressions with \`parameters\` and \`scenario\` in scope; coloured values are row arrays in colour element order using numbers and booleans; string columns take literal text; uuid columns accept UUID strings (any other text converts deterministically to a UUID via UUIDv5).
- Scenario code-mode initial state: function body returning \`{ PlaceName: tokens }\` keyed by NAME (asymmetric with per_place IDs); unknown names are silently dropped.
- Parameter access in any code surface: use \`parameters.<variableName>\` where \`<variableName>\` is the parameter's lower_snake_case \`variableName\` value (e.g. \`parameters.crash_threshold\`, never \`parameters.crashThreshold\`).

Auto-layout policy. Once you've finished adding or restructuring places and transitions, call \`applyAutoLayout\` so the canvas isn't littered with overlapping nodes at the origin. Pass \`askUserFirst: false\` ONLY when the net was empty at the start of the conversation and you built it from scratch. If user-arranged content existed beforehand — even if you only added a few nodes to it — pass \`askUserFirst: true\` and the user will be shown a Yes/No prompt. If they decline, leave the layout alone and continue without retrying unless they ask.

After calling tools, do not merely summarize the added or updated items, because the user can already see those changes in the UI. Final text should add extra value: explain important modelling choices, assumptions, how the pieces work together, and useful next checks or questions.

Here is a compact example Petrinaut document demonstrating coloured tokens, stochastic and predicate transitions, transition kernels with distributions, continuous dynamics, parameters, visualizer code, and scenarios:

\`\`\`json
${JSON.stringify(probabilisticSatellitesSDCPN, null, 2)}
\`\`\``;
