/**
 * Pi-style JSONL records exchanged between a persona agent and the browser
 * bridge: commands in, one `response` per command, and turn events out.
 */
import { StringDecoder } from "node:string_decoder";

import * as v from "valibot";

const commandId = v.optional(v.string());
const nonblank = v.pipe(
  v.string(),
  v.check((value) => value.trim().length > 0, "Expected nonblank text"),
);

export const personaCommandSchema = v.variant("type", [
  v.object({ id: commandId, type: v.literal("prompt"), message: nonblank }),
  v.object({ id: commandId, type: v.literal("get_state") }),
  v.object({ id: commandId, type: v.literal("get_transcript") }),
  v.object({
    id: commandId,
    type: v.literal("end"),
    reason: v.optional(v.string()),
  }),
]);
export type PersonaCommand = v.InferOutput<typeof personaCommandSchema>;

const responseFields = {
  id: commandId,
  type: v.literal("response"),
  command: v.string(),
};
const personaResponseSchema = v.union([
  v.object({
    ...responseFields,
    success: v.literal(true),
    data: v.optional(v.unknown()),
  }),
  v.object({ ...responseFields, success: v.literal(false), error: v.string() }),
]);
export type PersonaResponse = v.InferOutput<typeof personaResponseSchema>;

const personaEventSchema = v.variant("type", [
  v.object({ type: v.literal("turn_start"), message: v.string() }),
  v.object({ type: v.literal("assistant_message"), text: v.string() }),
  v.object({
    type: v.literal("turn_settled"),
    outcome: v.picklist(["replied", "failed", "aborted"]),
    submissionIds: v.array(v.string()),
    error: v.optional(v.string()),
  }),
]);
export type PersonaEvent = v.InferOutput<typeof personaEventSchema>;

export const personaRecordSchema = v.union([
  personaResponseSchema,
  personaEventSchema,
]);
export type PersonaRecord = PersonaResponse | PersonaEvent;

export type PersonaTranscriptEntry = {
  readonly speaker: "user" | "brunch";
  readonly text: string;
};

export type ParsedPersonaCommand =
  | { readonly ok: true; readonly command: PersonaCommand }
  | {
      readonly ok: false;
      readonly response: Extract<PersonaResponse, { success: false }>;
    };

/** Parse one inbound line; failures become the response Pi would send. */
export const parsePersonaCommand = (line: string): ParsedPersonaCommand => {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch (error) {
    return {
      ok: false,
      response: {
        type: "response",
        command: "parse",
        success: false,
        error: `Failed to parse command: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
  const parsed = v.safeParse(personaCommandSchema, raw);
  if (parsed.success) return { ok: true, command: parsed.output };
  const fields =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  return {
    ok: false,
    response: {
      ...(typeof fields.id === "string" ? { id: fields.id } : {}),
      type: "response",
      command: typeof fields.type === "string" ? fields.type : "parse",
      success: false,
      error: parsed.issues.map((issue) => issue.message).join("; "),
    },
  };
};

export const encodePersonaRecord = (record: PersonaRecord | PersonaCommand) =>
  `${JSON.stringify(record)}\n`;

/**
 * Strict JSONL framing: split only on LF and strip one preceding CR. Node's
 * `readline` also splits on U+2028/U+2029, which are valid inside JSON strings.
 */
export const createJsonlLineReader = (onLine: (line: string) => void) => {
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  const emit = (line: string) => {
    const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (trimmed.trim()) onLine(trimmed);
  };
  return {
    write(chunk: Buffer) {
      buffer += decoder.write(chunk);
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        emit(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf("\n");
      }
    },
    end() {
      buffer += decoder.end();
      emit(buffer);
      buffer = "";
    },
  };
};
