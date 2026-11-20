import { Hono } from "hono";
import { afterEach, expect, test, vi } from "vitest";

import { hashTurnLimit, turnSubmissionsPerMinute } from "./hash-turn-limit";

afterEach(() => {
  vi.useRealTimers();
});

/** An app whose turns are `POST /turn`, with the actor named by a test header in place of the session. */
const serve = () => {
  const app = new Hono()
    .use(async (context, next) => {
      context.set("hashSessionActorKey", context.req.header("x-actor") ?? "");
      await next();
    })
    .use(
      hashTurnLimit({
        isTurnSubmission: (context) =>
          context.req.method === "POST" && context.req.path === "/turn",
      }),
    )
    .all("*", (context) => context.text("served"));
  return async (method: string, path: string, actor = "hash:alice") => {
    const response = await app.fetch(
      new Request(`https://agents.test${path}`, {
        method,
        headers: { "x-actor": actor },
      }),
    );
    return {
      status: response.status,
      body: await response.text(),
      retryAfter: response.headers.get("retry-after"),
    };
  };
};

test("each actor may submit 30 turns a minute; nothing else counts, and other actors are unaffected", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const request = serve();
  expect(turnSubmissionsPerMinute).toBe(30);
  for (let i = 0; i < 40; i++) {
    expect((await request("GET", "/turn")).status).toBe(200);
    expect((await request("POST", "/turn/abort")).status).toBe(200);
  }
  for (let i = 0; i < 30; i++)
    expect((await request("POST", "/turn")).status).toBe(200);
  expect(await request("POST", "/turn")).toEqual({
    status: 429,
    body: '{"error":"too many turns"}',
    retryAfter: "60",
  });
  // A limited actor still reads and stops.
  expect((await request("GET", "/turn")).status).toBe(200);
  expect((await request("POST", "/turn/abort")).status).toBe(200);
  expect((await request("POST", "/turn", "hash:bob")).status).toBe(200);
  vi.setSystemTime(Date.now() + 60_000);
  expect((await request("POST", "/turn")).status).toBe(200);
});
