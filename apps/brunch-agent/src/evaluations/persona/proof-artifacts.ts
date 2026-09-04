import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  type FlueConversationPart,
  type FlueConversationSnapshot,
} from "@flue/sdk";

import { isAwaitingClient } from "../../conversation/client-tools.ts";
import { formatFlueTranscript } from "../../conversation/transcript.ts";
import { recoverRunbookWorkpiece } from "../runbook/artifacts.ts";

interface ProofEventBase {
  readonly sequence: number;
  readonly turn: number;
  readonly messageId: string;
}

export type ProofTraceEvent =
  | (ProofEventBase & {
      readonly type: "user";
      readonly text: string;
    })
  | (ProofEventBase & {
      readonly type: "activate";
      readonly toolCallId: string;
      readonly name: string;
      readonly outcome: "ok" | "error";
    })
  | (ProofEventBase & {
      readonly type: "read";
      readonly toolCallId: string;
      readonly path: string;
      readonly outcome: "ok" | "error";
    })
  | (ProofEventBase & {
      readonly type: "tool";
      readonly toolCallId: string;
      readonly name: string;
      readonly executor: "client" | "server";
      readonly outcome: "ok" | "error";
    })
  | (ProofEventBase & {
      readonly type: "text";
      readonly text: string;
      readonly hasWorkpiece: boolean;
    });

export interface ProofTrace {
  readonly conversationId: string;
  readonly events: readonly ProofTraceEvent[];
  readonly firstWorkpiece?: {
    readonly messageId: string;
    readonly sequence: number;
  };
}

type DynamicToolPart = Extract<FlueConversationPart, { type: "dynamic-tool" }>;
type UnsequencedProofTraceEvent = ProofTraceEvent extends infer Event
  ? Event extends ProofTraceEvent
    ? Omit<Event, "sequence">
    : never
  : never;

const stringInputField = (
  part: DynamicToolPart,
  field: string,
): string | undefined => {
  if (typeof part.input !== "object" || part.input === null) return undefined;
  if (!(field in part.input)) return undefined;
  const value = part.input[field as keyof typeof part.input];
  return typeof value === "string" ? value : undefined;
};

const traceResourcePath = (path: string): string => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return path;
  }
  const match = /\/packaged-skills\/skill:([^/:]+):[^/]+\/(.+)$/u.exec(decoded);
  return match?.[1] !== undefined && match[2] !== undefined
    ? `${match[1]}/${match[2]}`
    : path;
};

const hasRunbookWorkpiece = (text: string): boolean =>
  /```runbook-ir(?:\s|$)/u.test(text);

const toolOutcome = (part: DynamicToolPart): "ok" | "error" =>
  part.state === "output-available" ? "ok" : "error";

export const deriveProofTrace = (
  snapshot: FlueConversationSnapshot,
): ProofTrace => {
  const events: ProofTraceEvent[] = [];
  let turn = 0;
  let firstWorkpiece: ProofTrace["firstWorkpiece"];

  const append = (event: UnsequencedProofTraceEvent): ProofTraceEvent => {
    const sequenced = {
      ...event,
      sequence: events.length + 1,
    } as ProofTraceEvent;
    events.push(sequenced);
    return sequenced;
  };

  for (const message of snapshot.messages) {
    if (message.display !== "visible") continue;

    if (message.purpose === "user") {
      turn += 1;
      append({
        type: "user",
        turn,
        messageId: message.id,
        text: message.parts
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("\n"),
      });
      continue;
    }
    if (message.purpose !== "assistant") continue;

    for (const part of message.parts) {
      if (part.type === "text") {
        const event = append({
          type: "text",
          turn,
          messageId: message.id,
          text: part.text,
          hasWorkpiece: hasRunbookWorkpiece(part.text),
        });
        if (event.type === "text" && event.hasWorkpiece && !firstWorkpiece) {
          firstWorkpiece = {
            messageId: message.id,
            sequence: event.sequence,
          };
        }
        continue;
      }
      if (part.type !== "dynamic-tool") continue;

      if (part.toolName === "activate_skill") {
        append({
          type: "activate",
          turn,
          messageId: message.id,
          toolCallId: part.toolCallId,
          name: stringInputField(part, "name") ?? "<missing>",
          outcome: toolOutcome(part),
        });
        continue;
      }
      if (part.toolName === "read_skill_resource") {
        const path = stringInputField(part, "path");
        append({
          type: "read",
          turn,
          messageId: message.id,
          toolCallId: part.toolCallId,
          path: path === undefined ? "<missing>" : traceResourcePath(path),
          outcome: toolOutcome(part),
        });
        continue;
      }

      append({
        type: "tool",
        turn,
        messageId: message.id,
        toolCallId: part.toolCallId,
        name: part.toolName,
        executor:
          part.state === "output-available" && isAwaitingClient(part.output)
            ? "client"
            : "server",
        outcome: toolOutcome(part),
      });
    }
  }

  return {
    conversationId: snapshot.conversationId,
    events,
    ...(firstWorkpiece === undefined ? {} : { firstWorkpiece }),
  };
};

const traceEventMarkdown = (event: ProofTraceEvent): string => {
  const prefix = `${event.sequence}. turn ${event.turn}: `;
  switch (event.type) {
    case "user":
      return `${prefix}\`user\` — message \`${event.messageId}\``;
    case "activate":
      return `${prefix}\`activate(${event.name}, ${event.outcome})\` — call \`${event.toolCallId}\``;
    case "read":
      return `${prefix}\`read(${event.path}, ${event.outcome})\` — call \`${event.toolCallId}\``;
    case "tool":
      return `${prefix}\`tool(${event.name}, ${event.executor}, ${event.outcome})\` — call \`${event.toolCallId}\``;
    case "text":
      return `${prefix}\`text(hasWorkpiece=${String(event.hasWorkpiece)})\` — message \`${event.messageId}\``;
  }
};

export const formatProofTrace = (trace: ProofTrace): string =>
  [
    "# Canonical proof trace",
    "",
    `Conversation: \`${trace.conversationId}\``,
    "",
    ...trace.events.map(traceEventMarkdown),
    "",
  ].join("\n");

const atomicWrite = async (path: string, content: string): Promise<void> => {
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
};

export interface ProofArtifactManifest {
  readonly algorithm: "sha256";
  readonly files: readonly {
    readonly path: string;
    readonly sha256: string;
  }[];
}

export const refreshProofManifest = async (
  directory: string,
): Promise<ProofArtifactManifest> => {
  const names = (await readdir(directory, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name !== "manifest.json" &&
        !entry.name.endsWith(".tmp"),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const files = await Promise.all(
    names.map(async (name) => ({
      path: name,
      sha256: createHash("sha256")
        .update(await readFile(join(directory, name)))
        .digest("hex"),
    })),
  );
  const manifest: ProofArtifactManifest = { algorithm: "sha256", files };
  await atomicWrite(
    join(directory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
};

export const writeProofArtifacts = async (
  directory: string,
  snapshot: FlueConversationSnapshot,
): Promise<void> => {
  await mkdir(directory, { recursive: true });
  const trace = deriveProofTrace(snapshot);
  const workpiece = recoverRunbookWorkpiece(snapshot);
  await Promise.all([
    atomicWrite(
      join(directory, "snapshot.json"),
      `${JSON.stringify(snapshot, null, 2)}\n`,
    ),
    atomicWrite(
      join(directory, "transcript.md"),
      `${formatFlueTranscript(snapshot).trimEnd()}\n`,
    ),
    atomicWrite(
      join(directory, "trace.json"),
      `${JSON.stringify(trace, null, 2)}\n`,
    ),
    atomicWrite(join(directory, "trace.md"), formatProofTrace(trace)),
    ...(workpiece === undefined
      ? []
      : [
          atomicWrite(
            join(directory, "workpiece.md"),
            `${workpiece.content}\n`,
          ),
          atomicWrite(
            join(directory, "workpiece-source.json"),
            `${JSON.stringify(workpiece, null, 2)}\n`,
          ),
        ]),
  ]);
  await refreshProofManifest(directory);
};
