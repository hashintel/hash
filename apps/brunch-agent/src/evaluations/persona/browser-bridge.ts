/** Private run-local IPC. The launcher alone owns Chrome; Pi sends only utterances. */
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as v from "valibot";

const replySchema = v.object({
  conversationId: v.string(),
  text: v.string(),
  submissionIds: v.pipe(v.array(v.string()), v.minLength(1)),
});
export type PersonaBrowserReply = v.InferOutput<typeof replySchema>;

export const openPersonaBrowserBridge = async (
  turn: (message: string, signal: AbortSignal) => Promise<PersonaBrowserReply>,
) => {
  // macOS socket paths are short; never put this under the deep workspace path.
  const directory = await mkdtemp(join(tmpdir(), "bp-"));
  const socketPath = join(directory, "s");
  let active: AbortController | undefined;
  let activeTask: Promise<void> | undefined;
  const server = createServer((incoming, outgoing) => {
    if (active) {
      outgoing.writeHead(409).end("A persona turn is already active");
      return;
    }
    const controller = new AbortController();
    active = controller;
    outgoing.on("close", () => {
      if (!outgoing.writableFinished) controller.abort();
    });
    activeTask = (async () => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of incoming)
          chunks.push(Buffer.from(chunk as Uint8Array));
        const message = Buffer.concat(chunks).toString("utf8");
        if (incoming.method !== "POST" || !message.trim())
          throw new Error("Expected one nonempty persona utterance");
        const reply = await turn(message, controller.signal);
        outgoing.setHeader("content-type", "application/json");
        outgoing.end(JSON.stringify(reply));
      } catch (error) {
        outgoing
          .writeHead(500)
          .end(error instanceof Error ? error.message : "Browser turn failed");
      } finally {
        active = undefined;
      }
    })();
  });
  server.listen(socketPath);
  await once(server, "listening");
  return {
    socketPath,
    async close() {
      active?.abort();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await activeTask;
      await rm(directory, { recursive: true });
    },
  };
};

export const sendPersonaBrowserTurn = (
  socketPath: string,
  message: string,
  signal?: AbortSignal,
): Promise<PersonaBrowserReply> =>
  new Promise((resolve, reject) => {
    const call = request(
      { socketPath, method: "POST", path: "/", signal },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          try {
            if (response.statusCode !== 200) throw new Error(body);
            resolve(v.parse(replySchema, JSON.parse(body)));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    call.on("error", reject);
    call.end(message);
  });
