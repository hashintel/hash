/**
 * Non-interactive child driver for `--script <file>`. Executes each step in
 * order over the browser bridge socket without reading or adapting to Brunch's
 * replies, and emits structured JSONL progress/failure events on stdout.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import * as v from "valibot";

import { sendPersonaCommand } from "../browser-bridge.ts";
import { personaSocketVariable } from "../persona-cli.ts";
import {
  personaScriptStepSchema,
  readPersonaScript,
  scriptStepToPersonaCommand,
  type PersonaScript,
  type PersonaScriptStep,
} from "./script.ts";

import type { PersonaCommand, PersonaRecord } from "../rpc-protocol.ts";

export const personaScriptEventSchema = v.variant("type", [
  v.object({
    type: v.literal("step_start"),
    stepIndex: v.number(),
    step: personaScriptStepSchema,
  }),
  v.object({
    type: v.literal("step_ok"),
    stepIndex: v.number(),
    step: personaScriptStepSchema,
  }),
  v.object({
    type: v.literal("step_failed"),
    stepIndex: v.number(),
    step: personaScriptStepSchema,
    error: v.string(),
  }),
]);
export type PersonaScriptEvent = v.InferOutput<typeof personaScriptEventSchema>;

export type PersonaScriptRunResult =
  | { readonly ok: true; readonly completedSteps: number }
  | {
      readonly ok: false;
      readonly stepIndex: number;
      readonly step: PersonaScriptStep;
      readonly error: string;
    };

/**
 * Checks only whether the bridge accepted and settled the step. Assistant reply
 * text is intentionally ignored so a scripted person never adapts to Brunch.
 */
const stepFailureFromRecords = (
  command: PersonaCommand,
  records: readonly PersonaRecord[],
): string | undefined => {
  const response = records.find((record) => record.type === "response");
  if (!response) return "The persona bridge sent no response";
  if (!response.success) return response.error;
  if (command.type === "open" || command.type === "prompt") {
    const settled = records.find((record) => record.type === "turn_settled");
    if (settled?.outcome !== "replied")
      return `Brunch turn ${settled?.outcome ?? "did not settle"}${settled?.error ? `: ${settled.error}` : ""}`;
  }
  return undefined;
};

export const runPersonaScript = async (input: {
  readonly script: PersonaScript;
  readonly socketPath: string;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: PersonaScriptEvent) => void;
}): Promise<PersonaScriptRunResult> => {
  for (
    let stepIndex = 0;
    stepIndex < input.script.steps.length;
    stepIndex += 1
  ) {
    const step = input.script.steps[stepIndex];
    if (step === undefined) break;
    input.onEvent?.({ type: "step_start", stepIndex, step });
    const command = scriptStepToPersonaCommand(step);
    try {
      // eslint-disable-next-line no-await-in-loop -- Script steps execute sequentially against one conversation.
      const records = await sendPersonaCommand(input.socketPath, command, {
        signal: input.signal,
      });
      const failure = stepFailureFromRecords(command, records);
      if (failure !== undefined) {
        input.onEvent?.({
          type: "step_failed",
          stepIndex,
          step,
          error: failure,
        });
        return { ok: false, stepIndex, step, error: failure };
      }
      input.onEvent?.({ type: "step_ok", stepIndex, step });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      input.onEvent?.({
        type: "step_failed",
        stepIndex,
        step,
        error: message,
      });
      return { ok: false, stepIndex, step, error: message };
    }
  }
  return { ok: true, completedSteps: input.script.steps.length };
};

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const controller = new AbortController();
  const abort = () => controller.abort(new Error("Script runner stopped"));
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);
  try {
    const { values } = parseArgs({
      options: {
        script: { type: "string" },
        socket: { type: "string" },
        "expected-sha256": { type: "string" },
      },
    });
    if (!values.script) throw new Error("Supply --script <path>");
    const socketPath = values.socket ?? process.env[personaSocketVariable];
    if (!socketPath)
      throw new Error(
        `No persona bridge socket; pass --socket or set ${personaSocketVariable}`,
      );
    const loaded = await readPersonaScript(values.script, {
      expectedSha256: values["expected-sha256"],
    });
    const result = await runPersonaScript({
      script: loaded.script,
      socketPath,
      signal: controller.signal,
      onEvent: (event) => {
        process.stdout.write(`${JSON.stringify(event)}\n`);
      },
    });
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}
