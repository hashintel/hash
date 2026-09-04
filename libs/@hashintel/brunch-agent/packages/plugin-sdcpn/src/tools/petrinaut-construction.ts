import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { AWAITING_CLIENT } from "@hashintel/brunch-agent/client-tools";
import {
  normalizePetrinautAiToolInput,
  petrinautAiTools,
} from "@hashintel/petrinaut-core/ai";

export const PETRINAUT_CONSTRUCTION_TOOL_NAMES = [
  "getLatestNetDefinition",
  "addType",
  "addParameter",
  "addPlace",
  "addTransition",
  "addArc",
] as const satisfies readonly (keyof typeof petrinautAiTools)[];

export const petrinautFixtureToolNames = [
  "getLatestNetDefinition",
  "addArc",
] as const satisfies readonly (keyof typeof petrinautAiTools)[];

export type PetrinautConstructionToolName =
  (typeof PETRINAUT_CONSTRUCTION_TOOL_NAMES)[number];
type PetrinautFixtureToolName = (typeof petrinautFixtureToolNames)[number];

const issuePathFrom = (
  input: Record<string, unknown>,
  path: readonly PropertyKey[],
): [v.IssuePathItem, ...v.IssuePathItem[]] | undefined => {
  if (path.length === 0) return undefined;
  let current: unknown = input;
  return path.map((key) => {
    const parent = current;
    const value =
      typeof parent === "object" && parent !== null
        ? (parent as Record<PropertyKey, unknown>)[key]
        : undefined;
    current = value;
    return {
      type: "unknown" as const,
      origin: "value" as const,
      input: parent,
      key,
      value,
    };
  }) as [v.IssuePathItem, ...v.IssuePathItem[]];
};

const canonicalInputFor = (toolName: PetrinautConstructionToolName) => {
  const canonicalTool = petrinautAiTools[toolName];
  const jsonSchema = canonicalTool.inputSchema.toJSONSchema();

  return {
    description: [
      canonicalTool.description,
      ...(toolName === "addArc"
        ? [
            "A finite numeric-string weight is normalized to a number before canonical validation.",
          ]
        : []),
      "Canonical Petrinaut input JSON Schema:",
      JSON.stringify(jsonSchema),
    ].join("\n"),
    schema: v.pipe(
      v.looseObject({}),
      v.rawTransform((context) => {
        const normalizedInput = normalizePetrinautAiToolInput(
          toolName,
          context.dataset.value,
        );
        const parsed = canonicalTool.inputSchema.safeParse(normalizedInput);
        if (parsed.success) return parsed.data;

        for (const issue of parsed.error.issues) {
          context.addIssue({
            message: issue.message,
            path: issuePathFrom(context.dataset.value, issue.path),
          });
        }
        return context.NEVER;
      }),
    ),
  };
};

const awaitingClientOutput = v.object({
  awaiting: v.literal(AWAITING_CLIENT),
});

const definePetrinautConstructionTool = (
  toolName: PetrinautConstructionToolName,
) => {
  const canonicalInput = canonicalInputFor(toolName);
  return defineTool({
    name: toolName,
    description: canonicalInput.description,
    input: canonicalInput.schema,
    output: awaitingClientOutput,
    run() {
      return { output: { awaiting: AWAITING_CLIENT }, terminate: true };
    },
  });
};

export const petrinautConstructionTools = PETRINAUT_CONSTRUCTION_TOOL_NAMES.map(
  definePetrinautConstructionTool,
);

const isPetrinautFixtureTool = (
  tool: (typeof petrinautConstructionTools)[number],
): tool is (typeof petrinautConstructionTools)[number] & {
  readonly name: PetrinautFixtureToolName;
} =>
  petrinautFixtureToolNames.some((fixtureToolName) => {
    return fixtureToolName === tool.name;
  });

export const petrinautFixtureTools = petrinautConstructionTools.filter(
  isPetrinautFixtureTool,
);
