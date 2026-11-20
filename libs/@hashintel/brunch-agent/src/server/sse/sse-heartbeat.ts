/**
 * An SSE heartbeat: a comment line written into a server-sent event stream
 * that has been quiet for a while, so the proxies in front of the server
 * (Cloudflare closes a response after 125 s without a byte from the origin)
 * keep a long-lived stream open while it has nothing to say, such as a turn
 * waiting on the user. Event-source parsers, AI SDK's included, ignore
 * comments, so a client reads the same events with or without them.
 */

/** How long a stream may go without a byte before a heartbeat, by default: well inside Cloudflare's 125 s. */
export const defaultSseHeartbeatMs = 30_000;

/** The comment a heartbeat writes: a line starting with `:`, then the blank line that ends it. */
export const sseHeartbeatComment = ": heartbeat\n\n";

const lf = 0x0a;
const cr = 0x0d;

/** Whether the bytes written so far, of which `tail` holds the last four, end with an event's closing blank line. */
const endsAnEvent = (tail: readonly number[]) => {
  const [a, b, c, d] = tail.slice(-4).reverse();
  return (
    (a === lf && (b === lf || (b === cr && c === lf && d === cr))) ||
    (a === cr && b === cr)
  );
};

/**
 * `response` with its body written through as it comes, plus
 * `sseHeartbeatComment` each time `intervalMs` passes without a byte. A
 * heartbeat goes only between events: one due while an event is half
 * written waits for the next quiet interval after it ends. The heartbeat
 * stops when the body ends or errors, or the client cancels, which the body
 * is told. Status and headers are kept; a response without a body is
 * returned as it is.
 */
export const withSseHeartbeat = (
  response: Response,
  { intervalMs = defaultSseHeartbeatMs }: { readonly intervalMs?: number } = {},
): Response => {
  if (response.body === null) return response;
  const reader = response.body.getReader();
  const heartbeat = new TextEncoder().encode(sseHeartbeatComment);
  // Nothing written yet is a boundary, as after a blank line.
  let tail: number[] = [lf, lf];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ended = false;
  /** Start the quiet interval again; set once the body's controller exists. */
  let restart = () => {};
  const stop = () => {
    ended = true;
    clearTimeout(timer);
  };
  const body = new ReadableStream<Uint8Array>({
    start: (controller) => {
      const beat = () => {
        if (ended) return;
        if (endsAnEvent(tail)) {
          controller.enqueue(heartbeat);
          tail = [lf, lf];
        }
        restart();
      };
      restart = () => {
        clearTimeout(timer);
        timer = setTimeout(beat, intervalMs);
      };
      restart();
    },
    pull: async (controller) => {
      try {
        const next = await reader.read();
        if (ended) return;
        if (next.done) {
          stop();
          controller.close();
          return;
        }
        controller.enqueue(next.value);
        tail = [...tail, ...next.value.slice(-4)].slice(-4);
        restart();
      } catch (error) {
        if (ended) return;
        stop();
        controller.error(error);
      }
    },
    cancel: async (reason) => {
      stop();
      await reader.cancel(reason);
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};
