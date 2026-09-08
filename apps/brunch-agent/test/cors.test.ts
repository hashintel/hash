import { Hono } from "hono";
import { describe, expect, test } from "vitest";

import {
  agentOwnershipHeaders,
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
  flueConversationIdFrom,
} from "../src/conversation/identity.ts";
import {
  BRUNCH_CORS_ALLOWED_ORIGINS_ENV,
  createAgentCors,
  parseCorsAllowedOrigins,
} from "../src/http/cors.ts";
import { agentOwnershipGuard } from "../src/http/ownership.ts";
import { CHAT_AGENT_ROUTE, HEALTH_ROUTE } from "../src/http/routes.ts";

describe("parseCorsAllowedOrigins", () => {
  test("grants no cross-origin access when configuration is absent or blank", () => {
    expect(parseCorsAllowedOrigins(undefined)).toEqual([]);
    expect(parseCorsAllowedOrigins("   ")).toEqual([]);
  });

  test("normalizes and deduplicates exact HTTP origins", () => {
    expect(
      parseCorsAllowedOrigins(
        " https://demo.petrinaut.org/, HTTPS://PETRINAUT.STAGE.HASH.AI:443, https://demo.petrinaut.org ",
      ),
    ).toEqual([
      "https://demo.petrinaut.org",
      "https://petrinaut.stage.hash.ai",
    ]);
  });

  test.each([
    ",https://demo.petrinaut.org",
    "https://demo.petrinaut.org,",
    "https://demo.petrinaut.org,,https://petrinaut.stage.hash.ai",
  ])("rejects an empty comma-separated entry in %s", (value) => {
    expect(() => parseCorsAllowedOrigins(value)).toThrow(
      BRUNCH_CORS_ALLOWED_ORIGINS_ENV,
    );
  });

  test.each([
    "ftp://demo.petrinaut.org",
    "https://user:secret@demo.petrinaut.org",
    "https://@demo.petrinaut.org",
    "https://demo.petrinaut.org/path",
    "https://demo.petrinaut.org/a/..",
    "https://demo.petrinaut.org?",
    "https://demo.petrinaut.org?preview=true",
    "https://demo.petrinaut.org#",
    "https://demo.petrinaut.org#preview",
    "https://*.stage.hash.ai",
    "not-an-origin",
  ])("rejects invalid or broader-than-origin entry %s", (value) => {
    expect(() => parseCorsAllowedOrigins(value)).toThrow(
      BRUNCH_CORS_ALLOWED_ORIGINS_ENV,
    );
  });
});

const allowedOrigin = "https://demo.petrinaut.org";
const rejectedOrigin = "https://attacker.example";
const mount = `/agents/${CHAT_AGENT_ROUTE}`;
const identity = {
  principalKey: "principal-cors",
  conversationId: "conversation-cors",
};
const instanceId = flueConversationIdFrom(identity);
const conversationUrl = `http://brunch.test${mount}/${instanceId}`;

const buildCorsTestApp = () => {
  const app = new Hono();
  app.use("/agents/*", createAgentCors([allowedOrigin]));
  app.use(`${mount}/*`, agentOwnershipGuard(`${mount}/`));
  app.all(`${mount}/*`, (context) => context.text("admitted"));
  app.get(HEALTH_ROUTE, (context) => context.text("healthy"));
  app.get("/", (context) => context.text("root"));
  app.get("/assets/*", (context) => context.text("asset"));
  return app;
};

test("answers an allowed preflight before ownership", async () => {
  const response = await buildCorsTestApp().fetch(
    new Request(conversationUrl, {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": [
          "content-type",
          BRUNCH_PRINCIPAL_HEADER,
          BRUNCH_CONVERSATION_HEADER,
        ].join(","),
      },
    }),
  );

  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(
    allowedOrigin,
  );
  expect(response.headers.get("access-control-allow-methods")).toBe(
    "GET,POST,OPTIONS",
  );
  expect(response.headers.get("access-control-allow-headers")).toBe(
    `Content-Type,${BRUNCH_PRINCIPAL_HEADER},${BRUNCH_CONVERSATION_HEADER}`,
  );
  expect(response.headers.get("access-control-max-age")).toBe("600");
  expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  expect(response.headers.get("vary")).toContain("Origin");
  expect(response.headers.get("vary")).toContain(
    "Access-Control-Request-Headers",
  );
});

test.each(["GET", "POST"])(
  "grants an allowed origin access to an owned %s agent response",
  async (method) => {
    const response = await buildCorsTestApp().fetch(
      new Request(conversationUrl, {
        method,
        headers: {
          Origin: allowedOrigin,
          ...agentOwnershipHeaders(identity),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      allowedOrigin,
    );
    expect(response.headers.get("access-control-expose-headers")).toBe(
      [
        "flue-error-ref",
        "Stream-Next-Offset",
        "Stream-Cursor",
        "Stream-Up-To-Date",
        "Stream-Closed",
        "stream-sse-data-encoding",
      ].join(","),
    );
  },
);

test.each([
  ["bare", {}],
  ["missing-origin", { "Access-Control-Request-Method": "POST" }],
  ["blank-origin", { Origin: "  ", "Access-Control-Request-Method": "POST" }],
  ["missing-request-method", { Origin: allowedOrigin }],
  [
    "blank-request-method",
    { Origin: allowedOrigin, "Access-Control-Request-Method": "  " },
  ],
] satisfies [string, Record<string, string>][])(
  "does not let a %s OPTIONS request bypass ownership",
  async (_kind, headers) => {
    const response = await buildCorsTestApp().fetch(
      new Request(conversationUrl, {
        method: "OPTIONS",
        headers,
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  },
);

test("gives a syntactically valid rejected-origin preflight no CORS grant", async () => {
  const response = await buildCorsTestApp().fetch(
    new Request(conversationUrl, {
      method: "OPTIONS",
      headers: {
        Origin: rejectedOrigin,
        "Access-Control-Request-Method": "POST",
      },
    }),
  );

  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});

test.each(["GET", "POST"])(
  "gives a rejected origin no CORS grant for an owned %s",
  async (method) => {
    const response = await buildCorsTestApp().fetch(
      new Request(conversationUrl, {
        method,
        headers: {
          Origin: rejectedOrigin,
          ...agentOwnershipHeaders(identity),
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  },
);

test.each(["/", HEALTH_ROUTE, "/assets/app.js"])(
  "does not add CORS headers to unrelated route %s",
  async (path) => {
    const response = await buildCorsTestApp().fetch(
      new Request(`http://brunch.test${path}`, {
        headers: { Origin: allowedOrigin },
      }),
    );

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  },
);
