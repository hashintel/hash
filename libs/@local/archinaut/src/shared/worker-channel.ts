/**
 * Request and response over a worker thread. The parent sends one request at
 * a time per call and awaits its answer; the worker serves them in order. A
 * thrown error on the worker side rejects the matching call with its message;
 * a worker that dies rejects every outstanding call and every later one.
 *
 * Worker modules are TypeScript like the rest of the tool, so the thread
 * starts on `worker-bootstrap.js`, which compiles the entry on the fly.
 */

import { Worker, parentPort, workerData } from "node:worker_threads";

import { messageOf } from "./diagnostics";

export interface WorkerClient<Request, Response> {
  call: (request: Request) => Promise<Response>;
  close: () => Promise<void>;
}

interface Envelope<Request> {
  id: number;
  request: Request;
}

type Reply<Response> =
  | { id: number; ok: true; response: Response }
  | { id: number; ok: false; error: string };

/** What the bootstrap hands the thread: the entry to load and its input. */
export interface WorkerBootstrap {
  entry: string;
  input: unknown;
}

/** Starts `entry` as a worker; `input` reaches it through `workerInput()`. */
export const startWorker = <Request, Response>(
  entry: URL,
  input?: unknown,
): WorkerClient<Request, Response> => {
  const worker = new Worker(new URL("./worker-bootstrap.js", import.meta.url), {
    workerData: { entry: entry.href, input } satisfies WorkerBootstrap,
  });
  const pending = new Map<
    number,
    { resolve: (response: Response) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;
  let failure: Error | null = null;
  const fail = (error: Error): void => {
    failure ??= error;
    for (const waiting of pending.values()) {
      waiting.reject(error);
    }
    pending.clear();
  };
  worker.on("message", (reply: Reply<Response>) => {
    const waiting = pending.get(reply.id);
    pending.delete(reply.id);
    if (waiting === undefined) {
      return;
    }
    if (reply.ok) {
      waiting.resolve(reply.response);
    } else {
      waiting.reject(new Error(reply.error));
    }
  });
  worker.on("error", fail);
  worker.on("exit", (code) => {
    fail(new Error(`worker ${entry.pathname} exited with code ${code}`));
  });
  return {
    call: (request) =>
      failure === null
        ? new Promise((resolve, reject) => {
            const id = nextId;
            nextId += 1;
            pending.set(id, { resolve, reject });
            worker.postMessage({ id, request } satisfies Envelope<Request>);
          })
        : Promise.reject(failure),
    close: async () => {
      failure ??= new Error(`worker ${entry.pathname} was closed`);
      await worker.terminate();
    },
  };
};

/** The worker side: the input `startWorker` was given. */
export const workerInput = <Input>(): Input =>
  (workerData as WorkerBootstrap).input as Input;

/** The worker side: answers every request with `handle`'s result. */
export const serveWorker = <Request, Response>(
  handle: (request: Request) => Promise<Response> | Response,
): void => {
  const port = parentPort;
  if (port === null) {
    throw new Error("serveWorker must run inside a worker thread");
  }
  port.on("message", async ({ id, request }: Envelope<Request>) => {
    try {
      const response = await handle(request);
      port.postMessage({ id, ok: true, response } satisfies Reply<Response>);
    } catch (cause) {
      port.postMessage({
        id,
        ok: false,
        error: messageOf(cause),
      } satisfies Reply<Response>);
    }
  });
};
