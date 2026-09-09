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
        " https://app.example.com/, HTTPS://PREVIEW.EXAMPLE.COM:443, https://app.example.com ",
      ),
    ).toEqual(["https://app.example.com", "https://preview.example.com"]);
  });

  test.each([
    ",https://app.example.com",
    "https://app.example.com,",
    "https://app.example.com,,https://preview.example.com",
  ])("rejects an empty comma-separated entry in %s", (value) => {
    expect(() => parseCorsAllowedOrigins(value)).toThrow(
      BRUNCH_CORS_ALLOWED_ORIGINS_ENV,
    );
  });

  test.each([
    "ftp://app.example.com",
    "https://user:secret@app.example.com",
    "https://@app.example.com",
    "https://app.example.com/path",
    "https://app.example.com/a/..",
    "https://app.example.com?",
    "https://app.example.com?preview=true",
    "https://app.example.com#",
    "https://app.example.com#preview",
    "not-an-origin",
  ])("rejects invalid or broader-than-origin entry %s", (value) => {
    expect(() => parseCorsAllowedOrigins(value)).toThrow(
      BRUNCH_CORS_ALLOWED_ORIGINS_ENV,
    );
  });

  test("accepts one leading wildcard label in front of a domain", () => {
    expect(
      parseCorsAllowedOrigins(
        "https://*.stage.example.com, HTTPS://*.Stage.Example.com:443, https://*.preview.example.com:8443, https://*.example.com",
      ),
    ).toEqual([
      "https://*.stage.example.com",
      "https://*.preview.example.com:8443",
      "https://*.example.com",
    ]);
  });

  test.each([
    "https://*",
    "https://*.com",
    "https://preview-*.example.com",
    "https://*.*.example.com",
    "https://app.*.example.com",
    "https://**.example.com",
  ])(
    "rejects wildcard entry %s that is not one leading label before a domain",
    (value) => {
      expect(() => parseCorsAllowedOrigins(value)).toThrow(
        BRUNCH_CORS_ALLOWED_ORIGINS_ENV,
      );
    },
  );

  test.each([
    "https:example.com",
    "https:///example.com",
    String.raw`https:\example.com`,
    String.raw`https:\\example.com`,
  ])("rejects forgiving WHATWG URL form %s", (value) => {
    expect(() => parseCorsAllowedOrigins(value)).toThrow(
      BRUNCH_CORS_ALLOWED_ORIGINS_ENV,
    );
  });
});

const allowedOrigin = "https://app.example.com";
const rejectedOrigin = "https://attacker.example";
const mount = `/agents/${CHAT_AGENT_ROUTE}`;
const identity = {
  principalKey: "principal-cors",
  conversationId: "conversation-cors",
};
const instanceId = flueConversationIdFrom(identity);
const conversationUrl = `http://brunch.test${mount}/${instanceId}`;

const wildcardOrigin = "https://*.stage.example.com";

const buildCorsTestApp = (
  allowedOrigins: readonly string[] = [allowedOrigin],
) => {
  const app = new Hono();
  app.use("/agents/*", createAgentCors(allowedOrigins));
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

test.each([
  "https://petrinaut-git-main.stage.example.com",
  "https://x.stage.example.com",
])(
  "grants a wildcard-matched preview origin %s a preflight",
  async (origin) => {
    const response = await buildCorsTestApp([wildcardOrigin]).fetch(
      new Request(conversationUrl, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  },
);

test.each([
  "https://stage.example.com",
  "https://a.b.stage.example.com",
  "https://evil-stage.example.com",
  "https://stage.example.com.attacker.example",
  "http://preview.stage.example.com",
  "https://preview.stage.example.com:8443",
])("gives %s no CORS grant under a one-label wildcard", async (origin) => {
  const response = await buildCorsTestApp([wildcardOrigin]).fetch(
    new Request(conversationUrl, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
    }),
  );

  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});
