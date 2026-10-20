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
  /**
   * The case's opening, which `open` sends as the persona's first message;
   * undefined when the conversation already exists, as on resume.
   */
  opening: string | undefined;
  /** Submit through the real composer; call `admitted` once Brunch accepts it. */
  prompt(
    message: string,
    turn: {
      readonly signal: AbortSignal;
      readonly admitted: () => void;
      readonly opening: boolean;
    },
  ): Promise<PersonaBrowserReply>;
  getState(): Record<string, unknown>;
  getTranscript(): Promise<readonly PersonaTranscriptEntry[]>;
  end(reason: string | undefined): void;
};

/** Browser-turn errors wrap the stop that caused them; read through `cause`. */
const isAbort = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "AbortError" || isAbort(error.cause));

export const openPersonaBrowserBridge = async (
  handlers: PersonaBridgeHandlers,
) => {
  // macOS socket paths are short; never put this under the deep workspace path.
  const directory = await mkdtemp(join(tmpdir(), "bp-"));
  const socketPath = join(directory, "s");
  const removeDirectory = () => rm(directory, { recursive: true });
  const sockets = new Set<Socket>();
  const tasks = new Set<Promise<void>>();
  let active: AbortController | undefined;
  let completedTurns = 0;
  // Set once the opening is admitted: an admitted message is never resent.
  let opened = handlers.opening === undefined;

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
    command: Extract<PersonaCommand, { type: "open" | "prompt" }>,
  ) => {
    if (active) {
      send(socket, fail(command, "A persona turn is already active"));
      return;
    }
    const opening = command.type === "open";
    // `open` only before the conversation exists, `prompt` only after.
    const message = opening
      ? opened
        ? undefined
        : handlers.opening
      : opened
        ? command.message
        : undefined;
    if (message === undefined) {
      send(
        socket,
        fail(
          command,
          opening
            ? "The conversation is already open; reply with `say`."
            : "Start the conversation with `open`, which sends your opening message.",
        ),
      );
      return;
    }
    const controller = new AbortController();
    active = controller;
    const abortOnClose = () => controller.abort();
    socket.once("close", abortOnClose);
    const turn = { admitted: false };
    try {
      const reply = await handlers.prompt(message, {
        signal: controller.signal,
        opening,
        admitted: () => {
          if (turn.admitted) return;
          turn.admitted = true;
          opened = true;
          send(socket, succeed(command));
          broadcast({ type: "turn_start", message });
        },
      });
      // The sender waits for the admission response before reading events.
      if (!turn.admitted)
        throw new Error("The persona turn replied without being admitted");
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
          outcome:
            controller.signal.aborted || isAbort(error) ? "aborted" : "failed",
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
      case "open":
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
  try {
    server.listen(socketPath);
    await once(server, "listening");
  } catch (error) {
    await removeDirectory();
    throw error;
  }
  return {
    socketPath,
    async close() {
      active?.abort();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((done) => server.close(() => done()));
      await Promise.allSettled(tasks);
      await removeDirectory();
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
        if (
          !record.success ||
          (command.type !== "prompt" && command.type !== "open")
        )
          finish();
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
