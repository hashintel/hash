/** Run-local JSONL socket. The launcher alone owns Chrome; agents send records. */
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createConnection, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as v from "valibot";

import {
  createJsonlLineReader,
  encodePersonaRecord,
  parsePersonaCommand,
  personaRecordSchema,
  type PersonaCommand,
  type PersonaEvent,
  type PersonaRecord,
  type PersonaResponse,
  type PersonaTranscriptEntry,
} from "./rpc-protocol.ts";

export type PersonaBrowserReply = {
  readonly text: string;
  readonly submissionIds: readonly string[];
};

export type PersonaBridgeHandlers = {
  /** Submit through the real composer; call `admitted` once Brunch accepts it. */
  prompt(
    message: string,
    turn: { readonly signal: AbortSignal; readonly admitted: () => void },
  ): Promise<PersonaBrowserReply>;
  getState(): Record<string, unknown>;
  getTranscript(): Promise<readonly PersonaTranscriptEntry[]>;
  end(reason: string | undefined): void;
};

const isAbort = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

export const openPersonaBrowserBridge = async (
  handlers: PersonaBridgeHandlers,
) => {
  // macOS socket paths are short; never put this under the deep workspace path.
  const directory = await mkdtemp(join(tmpdir(), "bp-"));
  const socketPath = join(directory, "s");
  const sockets = new Set<Socket>();
  const tasks = new Set<Promise<void>>();
  let active: AbortController | undefined;
  let completedTurns = 0;

  const send = (socket: Socket, record: PersonaRecord) => {
    if (!socket.destroyed) socket.write(encodePersonaRecord(record));
  };
  const broadcast = (event: PersonaEvent) => {
    for (const socket of sockets) send(socket, event);
  };
  const succeed = (
    command: PersonaCommand,
    data?: unknown,
  ): PersonaResponse => ({
    ...(command.id === undefined ? {} : { id: command.id }),
    type: "response",
    command: command.type,
    success: true,
    ...(data === undefined ? {} : { data }),
  });
  const fail = (command: PersonaCommand, error: unknown): PersonaResponse => ({
    ...(command.id === undefined ? {} : { id: command.id }),
    type: "response",
    command: command.type,
    success: false,
    error: error instanceof Error ? error.message : String(error),
  });

  const prompt = async (
    socket: Socket,
    command: Extract<PersonaCommand, { type: "prompt" }>,
  ) => {
    if (active) {
      send(socket, fail(command, "A persona turn is already active"));
      return;
    }
    const controller = new AbortController();
    active = controller;
    const abortOnClose = () => controller.abort();
    socket.once("close", abortOnClose);
    const turn = { admitted: false };
    try {
      const reply = await handlers.prompt(command.message, {
        signal: controller.signal,
        admitted: () => {
          if (turn.admitted) return;
          turn.admitted = true;
          send(socket, succeed(command));
          broadcast({ type: "turn_start", message: command.message });
        },
      });
      completedTurns += 1;
      broadcast({ type: "assistant_message", text: reply.text });
      broadcast({
        type: "turn_settled",
        outcome: "replied",
        submissionIds: [...reply.submissionIds],
      });
    } catch (error) {
      if (!turn.admitted) send(socket, fail(command, error));
      else
        broadcast({
          type: "turn_settled",
          outcome: isAbort(error) ? "aborted" : "failed",
          submissionIds: [],
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      socket.off("close", abortOnClose);
      active = undefined;
    }
  };

  const dispatch = async (socket: Socket, command: PersonaCommand) => {
    switch (command.type) {
      case "prompt":
        return prompt(socket, command);
      case "get_state":
        return send(
          socket,
          succeed(command, {
            ...handlers.getState(),
            turnActive: active !== undefined,
            completedTurns,
          }),
        );
      case "get_transcript":
        return send(
          socket,
          await handlers
            .getTranscript()
            .then((entries) => succeed(command, { entries }))
            .catch((error: unknown) => fail(command, error)),
        );
      case "end":
        socket.write(encodePersonaRecord(succeed(command)), () =>
          handlers.end(command.reason),
        );
        return;
      default: {
        const unhandled: never = command;
        throw new Error(
          `Unhandled persona command ${JSON.stringify(unhandled)}`,
        );
      }
    }
  };

  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    const reader = createJsonlLineReader((line) => {
      const parsed = parsePersonaCommand(line);
      if (!parsed.ok) {
        send(socket, parsed.response);
        return;
      }
      const task = dispatch(socket, parsed.command).catch((error: unknown) =>
        send(socket, fail(parsed.command, error)),
      );
      tasks.add(task);
      void task.finally(() => tasks.delete(task));
    });
    socket.on("data", (chunk: Buffer) => reader.write(chunk));
    socket.on("end", () => reader.end());
    socket.on("error", () => socket.destroy());
  });
  server.listen(socketPath);
  await once(server, "listening");
  return {
    socketPath,
    async close() {
      active?.abort();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((done) => server.close(() => done()));
      await Promise.allSettled(tasks);
      await rm(directory, { recursive: true });
    },
  };
};

/**
 * Send one command and collect its records: the matching response, and for an
 * accepted prompt every event through `turn_settled`.
 */
export const sendPersonaCommand = (
  socketPath: string,
  command: PersonaCommand,
  options: { signal?: AbortSignal } = {},
): Promise<readonly PersonaRecord[]> =>
  new Promise((resolve, reject) => {
    const id = command.id ?? randomUUID();
    const records: PersonaRecord[] = [];
    let accepted = false;
    let settled = false;
    const socket = createConnection(socketPath);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", onAbort);
      socket.end();
      if (error === undefined) resolve(records);
      else reject(error);
    };
    const onAbort = () => {
      socket.destroy();
      const reason: unknown = options.signal?.reason;
      finish(reason instanceof Error ? reason : new Error("Aborted"));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const reader = createJsonlLineReader((line) => {
      let record: PersonaRecord;
      try {
        record = v.parse(personaRecordSchema, JSON.parse(line));
      } catch (error) {
        finish(
          error instanceof Error
            ? error
            : new Error("Unreadable persona bridge record"),
        );
        return;
      }
      if (record.type === "response") {
        if (record.id !== id) return;
        records.push(record);
        if (!record.success || command.type !== "prompt") finish();
        else accepted = true;
        return;
      }
      if (!accepted) return;
      records.push(record);
      if (record.type === "turn_settled") finish();
    });
    socket.on("data", (chunk: Buffer) => reader.write(chunk));
    socket.on("error", finish);
    socket.on("close", () =>
      finish(new Error("Persona bridge closed the connection")),
    );
    socket.write(encodePersonaRecord({ ...command, id }));
  });
