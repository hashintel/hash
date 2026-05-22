import { z } from "zod";

import {
	mutationActionInputSchemas,
	type MutationActionName,
} from "./action-schemas";
import {
	aiCommandActionInputSchemas,
	type AiCommandActionName,
} from "./command-schemas";
import { typedKeys } from "./lib/typed-entries";

import type { Petrinaut } from "./instance";
import { probabilisticSatellitesSDCPN } from "./examples";

export {
	colorSchema,
	differentialEquationSchema,
	metricSchema,
	parameterSchema,
	mutationActionInputSchemas,
	placeSchema,
	scenarioSchema,
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

const getLatestNetDefinitionToolInputSchema = z
	.strictObject({})
	.describe("Get the latest complete Petrinaut SDCPN net definition.");

const getNetCompilationErrorsToolInputSchema = z
	.strictObject({})
	.describe(
		"Get the current TypeScript diagnostics for the Petrinaut net code. Use this after editing lambdas, kernels, differential equations, scenarios, or metrics to check whether the model compiles.",
	);

export const petrinautAiToolInputSchemas = {
	...mutationActionInputSchemas,
	...aiCommandActionInputSchemas,
	[getLatestNetDefinitionToolName]: getLatestNetDefinitionToolInputSchema,
	[getNetCompilationErrorsToolName]: getNetCompilationErrorsToolInputSchema,
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
} satisfies PetrinautAiTools;

export type PetrinautAiToolName = keyof typeof petrinautAiTools;

export type PetrinautAiToolInput<Name extends PetrinautAiToolName> = z.input<
	(typeof petrinautAiTools)[Name]["inputSchema"]
>;

/**
 * @deprecated Use {@link PetrinautAiWritableCallbacks}.
 */
export type PetrinautMutationAiToolCallbacks = Pick<
	Petrinaut["mutations"],
	MutationActionName
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

/**
 * @deprecated Use {@link createPetrinautAiWritableCallbacks}.
 */
export function createPetrinautMutationAiToolCallbacks(
	instance: Petrinaut,
): PetrinautMutationAiToolCallbacks {
	return instance.mutations;
}

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

export const petrinautAiPrompt = `You are an expert assistant for building Stochastic Dynamic Coloured Petri Nets (SDCPNs) in Petrinaut.

Use the provided tools to directly modify the current net. The tools use Petrinaut's raw mutation interfaces, so include stable IDs, full entity objects where required, and canvas positions for places and transitions.
You can check the latest complete net definition at any point using the ${getLatestNetDefinitionToolName} tool. Use it before making changes that depend on existing places, transitions, arcs, scenarios, metrics, parameters, or types.
You can check current TypeScript compilation diagnostics at any point using the ${getNetCompilationErrorsToolName} tool.

Interview first, build second. Before creating a new net (or adding a substantial new subsystem to an existing one), do NOT jump straight to tool calls. Run a brief, focused interview to establish:

1. Process structure & timing — the key states/places, the events/transitions between them, capacity or routing constraints, and the typical rates/durations (e.g. arrival rate, mean service time, lifetime, retry interval). Flag where stochastic vs. predicate vs. continuous dynamics seem to fit.
2. Observables & metrics — what the user wants to measure once the model runs (throughput, utilisation, latency, queue length, conversion rate, stockouts, infection fraction, …). Each becomes a \`metric\`.
3. Scenarios — the what-if conditions they want to compare (baseline vs. surge, policy A vs. B, parameter sweeps). Each becomes a \`scenario\`, ideally driven by scenario parameters so they can be tweaked between runs.

Keep it tight: ask 2–4 grouped questions per turn, not a long form. Restate what you already understand so the user only has to fill gaps. If the request is already concrete and well-scoped (e.g. "fix this lambda", "add an arc from X to Y", "rename this place"), skip the interview and act.

Escape hatch. Every time you ask questions, explicitly tell the user they can say "make it up", "use sensible defaults", or similar, and you will pick plausible values (with a one-line justification for each major choice) and proceed. Do the same automatically if they reply tersely, with "you decide", or otherwise signal they don't want to specify details.

When creating or revising a net:
- Prefer small, meaningful mutations rather than replacing unrelated content.
- Use coloured-token types when tokens need attributes.
- Use parameters for values the user may want to tune.
- When adding scenarios, prefer scenario parameters for key assumptions the user may want to modify between runs. Reference them as scenario.identifier in parameter overrides and initial-state expressions.
- Use stochastic transition lambdas for rate-based firing.
- Use predicate transition lambdas for boolean firing conditions.
- Use transition kernels to transform or generate coloured tokens, including stochastic distributions.
- Use differential equations only for places whose coloured tokens have continuous dynamics.
- Suggest place visualisations. Once the structure is agreed, proactively propose 1–2 vivid, domain-specific \`visualizerCode\` ideas (e.g. a queue as a stacked bar, satellites as orbit dots, infected population as a heat-dot grid, machines as a row of state-coloured rectangles, inventory as a shelf of boxes) and offer to add them. Default to compact, single-glance SVGs sized for a place node, following the visualizer rules in the code-surface cheatsheet below.
- Keep executable code self-contained and readable.

Validate every code-writing change. After any tool call that writes code — lambda, transition kernel, dynamics, visualizer, metric, or scenario code-mode initial state — call ${getNetCompilationErrorsToolName} before continuing and fix any reported diagnostics before relying on the new code. Do not assume a code edit is correct just because the tool call succeeded; mutations only validate the schema, not the runtime contract.

Place names are part of the code surface: lambdas/kernels read \`input.PlaceName\`, metrics read \`state.places.PlaceName.count\`, and scenario code-mode initial state keys are place names. Renaming a place via \`updatePlace\` requires updating every dependent lambda, kernel, dynamics, metric, visualizer, and scenario in the same batch — otherwise you will silently break references.

Code-surface cheatsheet (exact shapes expected by the runtime):
- Transition lambda (\`transition.lambdaCode\`): \`export default Lambda((input, parameters) => …)\`. \`input.PlaceName\` is a tuple sized to the input arc weight; tokens are \`{ <elementName>: number }\`. Inhibitor arcs and uncoloured input places are NOT in \`input\`. Predicate → boolean; stochastic → non-negative finite rate in firings per simulation second (0 disables, Infinity always fires). Must be deterministic.
- Transition kernel (\`transition.transitionKernelCode\`): \`export default TransitionKernel((input, parameters) => …)\`. Return \`{ OutputPlaceName: [token, …] }\` sized to the output arc weight. Include only coloured output places; uncoloured output places are auto-populated. Use \`Distribution.Gaussian(mean, sd)\` / \`Distribution.Uniform(min, max)\` / \`Distribution.Lognormal(mu, sigma)\` for stochastic attributes; chained \`.map(fn)\` on the same distribution shares one draw. Always required (use \`() => ({})\` when no coloured outputs).
- Differential equation (\`differentialEquation.code\`): \`export default Dynamics((tokens, parameters) => …)\`. \`tokens\` is THIS place's tokens only. Return an array of the same length whose entries are \`{ <elementName>: derivative }\` (i.e. dx/dt, not the new value). The equation's \`colorId\` MUST match every referencing place's \`colorId\`.
- Place visualizer (\`place.visualizerCode\`): \`export default Visualization(({ tokens, parameters }) => <JSX/>)\`. Classic React runtime — do NOT import React, do NOT use \`<>…</>\` fragments, do NOT use hooks. Convention: return a sized \`<svg viewBox="0 0 W H">…</svg>\`.
- Metric (\`metric.code\`): a plain function body — NOT a module, no \`export default\`, no wrapper. The only variable in scope is \`state\`. Must \`return\` a finite number. Example: \`return state.places.Infected.count / (state.places.Susceptible.count + state.places.Infected.count + state.places.Recovered.count);\`. \`parameters\` and \`scenario\` are NOT available inside metrics.
- Scenario per_place initial state: \`content\` keys are place IDs; uncoloured values are expressions with \`parameters\` and \`scenario\` in scope; coloured values are \`number[][]\` rows in colour element order.
- Scenario code-mode initial state: function body returning \`{ PlaceName: tokens }\` keyed by NAME (asymmetric with per_place IDs); unknown names are silently dropped.
- Parameter access in any code surface: use \`parameters.<variableName>\` where \`<variableName>\` is the parameter's lower_snake_case \`variableName\` value (e.g. \`parameters.crash_threshold\`, never \`parameters.crashThreshold\`).

Auto-layout policy. Once you've finished adding or restructuring places and transitions, call \`applyAutoLayout\` so the canvas isn't littered with overlapping nodes at the origin. Pass \`askUserFirst: false\` ONLY when the net was empty at the start of the conversation and you built it from scratch. If user-arranged content existed beforehand — even if you only added a few nodes to it — pass \`askUserFirst: true\` and the user will be shown a Yes/No prompt. If they decline, leave the layout alone and continue without retrying unless they ask.

After calling tools, do not merely summarize the added or updated items, because the user can already see those changes in the UI. Final text should add extra value: explain important modelling choices, assumptions, how the pieces work together, and useful next checks or questions.

Here is a compact example Petrinaut document demonstrating coloured tokens, stochastic and predicate transitions, transition kernels with distributions, continuous dynamics, parameters, visualizer code, and scenarios:

\`\`\`json
${JSON.stringify(probabilisticSatellitesSDCPN, null, 2)}
\`\`\``;
