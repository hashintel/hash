import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { AWAITING_CLIENT } from "../../../client-tool.ts";

export const VALIDATED_CONSTRUCTION_MODE = "validated-construction";

export const PETRINAUT_CONSTRUCTION_TOOL_NAMES = [
  "getLatestNetDefinition",
  "addType",
  "addParameter",
  "addPlace",
  "addTransition",
  "addArc",
] as const satisfies readonly (keyof typeof petrinautAiTools)[];

export type PetrinautConstructionToolName =
  (typeof PETRINAUT_CONSTRUCTION_TOOL_NAMES)[number];

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
      "Canonical Petrinaut input JSON Schema:",
      JSON.stringify(jsonSchema),
    ].join("\n"),
    schema: v.pipe(
      v.looseObject({}),
      v.rawTransform((context) => {
        const parsed = canonicalTool.inputSchema.safeParse(
          context.dataset.value,
        );
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
