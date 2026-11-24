/** Declarative persona scripts: validated JSON step lists with content hashes. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import * as v from "valibot";

import { nonblankTextSchema, type PersonaCommand } from "../rpc-protocol.ts";

export const personaScriptStepSchema = v.variant("type", [
  v.object({ type: v.literal("open") }),
  v.object({ type: v.literal("say"), message: nonblankTextSchema }),
  v.object({ type: v.literal("end"), reason: v.optional(v.string()) }),
]);
export type PersonaScriptStep = v.InferOutput<typeof personaScriptStepSchema>;

export const personaScriptSchema = v.object({
  steps: v.pipe(
    v.array(personaScriptStepSchema),
    v.minLength(1),
    v.check(
      (steps) =>
        steps.every((step, index) => step.type !== "open" || index === 0),
      "`open` may appear only as the first step",
    ),
    v.check(
      (steps) =>
        steps.every(
          (step, index) => step.type !== "end" || index === steps.length - 1,
        ),
      "`end` may appear only as the final step",
    ),
  ),
});
export type PersonaScript = v.InferOutput<typeof personaScriptSchema>;

export type LoadedPersonaScript = {
  readonly scriptPath: string;
  readonly scriptSha256: string;
  readonly rawBytes: Buffer;
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
  options: { readonly expectedSha256?: string } = {},
): Promise<LoadedPersonaScript> => {
  const scriptPath = resolve(filePath);
  const rawBytes = await readFile(scriptPath).catch((cause: unknown) => {
    throw new Error(`Could not read persona script ${scriptPath}`, { cause });
  });
  const scriptSha256 = createHash("sha256").update(rawBytes).digest("hex");
  if (
    options.expectedSha256 !== undefined &&
    scriptSha256 !== options.expectedSha256
  ) {
    throw new Error(
      `Persona script ${scriptPath} changed since preflight (expected sha256 ${options.expectedSha256}, got ${scriptSha256})`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBytes.toString("utf8"));
  } catch (cause) {
    throw new Error(`Persona script ${scriptPath} is not valid JSON`, {
      cause,
    });
  }
  return {
    scriptPath,
    scriptSha256,
    rawBytes,
    script: parsePersonaScript(parsed, scriptPath),
  };
};

/**
 * Content-addressed immutable copy under `<run>/` so the child runs the exact
 * preflight bytes and later resumes never overwrite an earlier run's script.
 */
export const writePersonaScriptSnapshot = async (
  run: string,
  script: LoadedPersonaScript,
): Promise<string> => {
  const snapshotPath = join(
    run,
    `script-${script.scriptSha256.slice(0, 12)}.json`,
  );
  await writeFile(snapshotPath, script.rawBytes, { mode: 0o600 });
  return snapshotPath;
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
