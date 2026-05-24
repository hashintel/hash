import type { WorkerLike } from "../../environment";
import type { ClientMessage, ServerMessage } from "./protocol";

/** Dynamically import and instantiate the language server worker. */
export async function createLanguageServerWorker(): Promise<
  WorkerLike<ClientMessage, ServerMessage>
> {
  const LanguageServerWorker = await import("./language-server.worker.ts?worker&inline");
  // eslint-disable-next-line new-cap
  return new LanguageServerWorker.default() as WorkerLike<ClientMessage, ServerMessage>;
}
