/**
 * The persona agent's command-line surface over the browser bridge. Each call
 * sends one record and prints what that command produced, then exits.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { sendPersonaCommand } from "./browser-bridge.ts";
import {
  encodePersonaRecord,
  parsePersonaCommand,
  type PersonaCommand,
  type PersonaRecord,
  type PersonaTranscriptEntry,
} from "./rpc-protocol.ts";

export const personaSocketVariable = "BRUNCH_PERSONA_SOCKET";

export const personaCliUsage = `Usage: persona <command> [arguments] [--json]

  say <text>          Send one message through the browser and print Brunch's reply.
                      Reads the message from stdin when no text is given.
  state               Print the conversation state as JSON.
  transcript          Print the conversation so far.
  end [reason]        End the conversation and close the run.
  rpc [record]        Send one raw JSON command (or read it from stdin) and
                      print every resulting record as JSONL.

  --json              Print raw JSONL records instead of plain text.
  --socket <path>     Bridge socket (default: $${personaSocketVariable}).`;

const personaFlags = new Set(["--json", "--help", "-h"]);

/**
 * Separates the CLI's own options from the command and its text. After the
 * command word, only this CLI's flags are options: a message may itself begin
 * with a dash. `--` ends option parsing outright.
 */
export const splitPersonaArguments = (
  args: readonly string[],
): { readonly options: string[]; readonly positionals: string[] } => {
  const options: string[] = [];
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) break;
    if (arg === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (arg === "--socket") {
      options.push(arg, ...args.slice(index + 1, index + 2));
      index++;
    } else if (
      personaFlags.has(arg) ||
      arg.startsWith("--socket=") ||
      (arg.startsWith("-") && positionals.length === 0)
    )
      options.push(arg);
    else positionals.push(arg);
  }
  return { options, positionals };
};

const readStdin = async () => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString("utf8");
};

export const personaCommandFromArguments = async (
  positionals: readonly string[],
  stdin: () => Promise<string> = readStdin,
): Promise<PersonaCommand> => {
  const [name, ...rest] = positionals;
  const text = rest.length > 0 ? rest.join(" ") : undefined;
  switch (name) {
    case "say":
      // Heredocs end in a newline the person never typed.
      return { type: "prompt", message: text ?? (await stdin()).trimEnd() };
    case "state":
      return { type: "get_state" };
    case "transcript":
      return { type: "get_transcript" };
    case "end":
      return { type: "end", ...(text === undefined ? {} : { reason: text }) };
    case "rpc": {
      const parsed = parsePersonaCommand(text ?? (await stdin()));
      if (!parsed.ok) throw new Error(parsed.response.error);
      return parsed.command;
    }
    default:
      throw new Error(personaCliUsage);
  }
};

const formatTranscript = (data: unknown) => {
  const entries =
    typeof data === "object" && data !== null && "entries" in data
      ? (data.entries as readonly PersonaTranscriptEntry[])
      : [];
  return entries
    .map(
      (entry) =>
        `${entry.speaker === "user" ? "You" : "Brunch"}: ${entry.text}`,
    )
    .join("\n\n");
};

/** Plain-text rendering of one command's records; failures throw. */
export const formatPersonaResult = (
  command: PersonaCommand,
  records: readonly PersonaRecord[],
): string => {
  const response = records.find((record) => record.type === "response");
  if (!response) throw new Error("The persona bridge sent no response");
  if (!response.success) throw new Error(response.error);
  switch (command.type) {
    case "prompt": {
      const settled = records.find((record) => record.type === "turn_settled");
      if (settled?.outcome !== "replied")
        throw new Error(
          `Brunch turn ${settled?.outcome ?? "did not settle"}${settled?.error ? `: ${settled.error}` : ""}`,
        );
      return records
        .flatMap((record) =>
          record.type === "assistant_message" ? [record.text] : [],
        )
        .join("\n\n");
    }
    case "get_state":
      return JSON.stringify(response.data, null, 2);
    case "get_transcript":
      return formatTranscript(response.data);
    case "end":
      return "Conversation ended.";
    default: {
      const unhandled: never = command;
      throw new Error(`Unhandled persona command ${JSON.stringify(unhandled)}`);
    }
  }
};

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const { options: optionArguments, positionals } = splitPersonaArguments(
    process.argv.slice(2),
  );
  const { values } = parseArgs({
    args: optionArguments,
    options: {
      json: { type: "boolean" },
      socket: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  try {
    if (values.help || positionals.length === 0) {
      process.stdout.write(`${personaCliUsage}\n`);
    } else {
      const socketPath = values.socket ?? process.env[personaSocketVariable];
      if (!socketPath)
        throw new Error(
          `No persona bridge socket; pass --socket or set ${personaSocketVariable}`,
        );
      const command = await personaCommandFromArguments(positionals);
      const records = await sendPersonaCommand(socketPath, command);
      if (values.json || positionals[0] === "rpc") {
        for (const record of records)
          process.stdout.write(encodePersonaRecord(record));
        const response = records.find((record) => record.type === "response");
        if (!response?.success) process.exitCode = 1;
      } else {
        process.stdout.write(`${formatPersonaResult(command, records)}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
