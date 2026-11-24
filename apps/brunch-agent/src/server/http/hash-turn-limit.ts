/**
 * Hono middleware that limits how many turns each HASH user can start, since
 * every turn costs model spend.
 */
import type { MiddlewareHandler } from "hono";

/**
 * Turn submissions each actor may make per minute. A person typing messages
 * or answering the agent stays far below it; a runaway script or loop does
 * not.
 */
export const turnSubmissionsPerMinute = 30;

const windowMs = 60_000;

export type TurnWindows = Map<
  string,
  { count: number; readonly resetsAt: number }
>;

/**
 * Counts each actor's turn submissions in fixed one-minute windows, answering
 * 429 past the limit. Only a turn submission counts: Flue's `send`, a `POST`
 * to the conversation's instance URL itself. Its sub-routes (`abort`,
 * browser-call claims, leases and settlements), every `GET` and the identity
 * route start no turn and pass uncounted.
 *
 * The windows live in this process's memory, so an actor can start up to the
 * limit on each Brunch task running at the time, old and new alike during a
 * deploy. Spend stays bounded by the limit times the task count, which is
 * what the limit is for; FE-2198 holds a limit shared across tasks.
 *
 * Mounted after the session and ownership checks, so a refused request is
 * never counted.
 */
export const hashTurnLimit = ({
  mountPrefix,
  windows = new Map(),
}: {
  /** The agent's mount, with its trailing slash. */
  readonly mountPrefix: string;
  readonly windows?: TurnWindows;
}): MiddlewareHandler => {
  const isTurnSubmission = (method: string, path: string) =>
    method === "POST" &&
    path.startsWith(mountPrefix) &&
    /^[^/]+\/?$/u.test(path.slice(mountPrefix.length));

  return async (context, next) => {
    if (!isTurnSubmission(context.req.method, context.req.path)) {
      await next();
      return;
    }
    const actorKey = context.get("hashSessionActorKey");
    const now = Date.now();
    let window = windows.get(actorKey);
    if (window === undefined || window.resetsAt <= now) {
      for (const [key, entry] of windows)
        if (entry.resetsAt <= now) windows.delete(key);
      window = { count: 0, resetsAt: now + windowMs };
      windows.set(actorKey, window);
    }
    if (window.count >= turnSubmissionsPerMinute) {
      context.header(
        "retry-after",
        String(Math.ceil((window.resetsAt - now) / 1000)),
      );
      return context.json({ error: "too many turns" }, 429);
    }
    window.count += 1;
    await next();
  };
};
