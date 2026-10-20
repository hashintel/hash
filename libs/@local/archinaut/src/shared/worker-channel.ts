/**
 * Request and response over a worker thread. The parent sends one request at
 * a time per call and awaits its answer; the worker serves them in order. A
 * thrown error on the worker side rejects the matching call with its message.
 */

import { Worker, parentPort } from "node:worker_threads";

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

/** Starts `entry` as a worker; `workerData` reaches it through `workerData`. */
export const startWorker = <Request, Response>(
  entry: URL,
  workerData?: unknown,
): WorkerClient<Request, Response> => {
  const worker = new Worker(entry, { workerData });
  const pending = new Map<
    number,
    { resolve: (response: Response) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;
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
  worker.on("error", (error) => {
    for (const waiting of pending.values()) {
      waiting.reject(error);
    }
    pending.clear();
  });
  return {
    call: (request) =>
      new Promise((resolve, reject) => {
        const id = nextId;
        nextId += 1;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, request } satisfies Envelope<Request>);
      }),
    close: async () => {
      await worker.terminate();
    },
  };
};

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
        error: cause instanceof Error ? cause.message : String(cause),
      } satisfies Reply<Response>);
    }
  });
};
