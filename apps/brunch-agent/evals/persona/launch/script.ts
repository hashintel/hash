/** Declarative persona scripts: validated JSON step lists with content hashes. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as v from "valibot";

import type { PersonaCommand } from "../rpc-protocol.ts";

const nonblank = v.pipe(
  v.string(),
  v.check((value) => value.trim().length > 0, "Expected nonblank text"),
);

export const personaScriptStepSchema = v.variant("type", [
  v.object({ type: v.literal("open") }),
  v.object({ type: v.literal("say"), message: nonblank }),
  v.object({ type: v.literal("end"), reason: v.optional(v.string()) }),
]);
export type PersonaScriptStep = v.InferOutput<typeof personaScriptStepSchema>;

export const personaScriptSchema = v.object({
  steps: v.pipe(v.array(personaScriptStepSchema), v.minLength(1)),
});
export type PersonaScript = v.InferOutput<typeof personaScriptSchema>;

export type LoadedPersonaScript = {
  readonly scriptPath: string;
  readonly scriptSha256: string;
  readonly script: PersonaScript;
};

const formatIssuePath = (issue: v.BaseIssue<unknown>) => {
  if (!issue.path || issue.path.length === 0) return "";
  const formatted = issue.path
    .map((segment) =>
      typeof segment.key === "number"
        ? `[${segment.key}]`
        : `.${String(segment.key)}`,
    )
    .join("")
    .replace(/^\./, "");
  return `${formatted}: `;
};

export const parsePersonaScript = (
  raw: unknown,
  sourceLabel?: string,
): PersonaScript => {
  const parsed = v.safeParse(personaScriptSchema, raw);
  if (parsed.success) return parsed.output;
  const details = parsed.issues
    .map((issue) => `${formatIssuePath(issue)}${issue.message}`)
    .join("; ");
  throw new Error(
    `Invalid persona script${sourceLabel ? ` ${sourceLabel}` : ""}: ${details}`,
  );
};

export const readPersonaScript = async (
  filePath: string,
): Promise<LoadedPersonaScript> => {
  const scriptPath = resolve(filePath);
  const bytes = await readFile(scriptPath).catch((cause: unknown) => {
    throw new Error(`Could not read persona script ${scriptPath}`, { cause });
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch (cause) {
    throw new Error(`Persona script ${scriptPath} is not valid JSON`, {
      cause,
    });
  }
  return {
    scriptPath,
    scriptSha256: createHash("sha256").update(bytes).digest("hex"),
    script: parsePersonaScript(parsed, scriptPath),
  };
};

export const personaScriptHasOpenStep = (script: PersonaScript): boolean =>
  script.steps.some((step) => step.type === "open");

export const scriptStepToPersonaCommand = (
  step: PersonaScriptStep,
): PersonaCommand => {
  switch (step.type) {
    case "open":
      return { type: "open" };
    case "say":
      return { type: "prompt", message: step.message };
    case "end":
      return {
        type: "end",
        ...(step.reason === undefined ? {} : { reason: step.reason }),
      };
    default: {
      const unhandled: never = step;
      throw new Error(
        `Unhandled persona script step ${JSON.stringify(unhandled)}`,
      );
    }
  }
};
