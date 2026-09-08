import { cors } from "hono/cors";

import {
  BRUNCH_CONVERSATION_HEADER,
  BRUNCH_PRINCIPAL_HEADER,
} from "@hashintel/brunch-agent-transport-aisdk/headers";

import type { MiddlewareHandler } from "hono";

export const BRUNCH_CORS_ALLOWED_ORIGINS_ENV = "BRUNCH_CORS_ALLOWED_ORIGINS";

const AGENT_CORS_METHODS = ["GET", "POST", "OPTIONS"];
const AGENT_CORS_REQUEST_HEADERS = [
  "Content-Type",
  BRUNCH_PRINCIPAL_HEADER,
  BRUNCH_CONVERSATION_HEADER,
];
// No upstream package exports this complete set, so keep the browser-response list local.
const AGENT_CORS_RESPONSE_HEADERS = [
  "flue-error-ref",
  "Stream-Next-Offset",
  "Stream-Cursor",
  "Stream-Up-To-Date",
  "Stream-Closed",
  "stream-sse-data-encoding",
];
// Enforce exact lexical origins before WHATWG URL parsing normalizes forgiving separator forms.
const exactHttpOriginPattern =
  /^https?:\/\/(?:\[[0-9a-f:.]+\]|[^\s:/?#@\\]+)(?::[0-9]+)?\/?$/iu;

// One wildcard label in front of a domain with at least two labels: `*.stage.hash.ai`, never `*.ai`.
const wildcardHostPattern = /^\*\.[^.*]+(?:\.[^.*]+)+$/u;

const invalidOriginConfiguration = (): Error =>
  new Error(
    `${BRUNCH_CORS_ALLOWED_ORIGINS_ENV} must contain only comma-separated exact HTTP(S) origins, optionally with one leading wildcard label such as https://*.example.com`,
  );

const normalizeCorsOrigin = (value: string): string => {
  if (!exactHttpOriginPattern.test(value)) {
    throw invalidOriginConfiguration();
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidOriginConfiguration();
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.origin === "null"
  ) {
    throw invalidOriginConfiguration();
  }

  if (url.hostname.includes("*") && !wildcardHostPattern.test(url.hostname)) {
    throw invalidOriginConfiguration();
  }

  return url.origin;
};

/**
 * Wildcard entries match exactly one host label, like a wildcard TLS certificate:
 * `https://*.stage.hash.ai` admits `https://petrinaut-git-main.stage.hash.ai` but not
 * `https://stage.hash.ai` or `https://a.b.stage.hash.ai`.
 */
const isAllowedOrigin = (
  allowedOrigins: readonly string[],
  origin: string,
): boolean => {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin === "null") {
    return false;
  }

  return allowedOrigins.some((entry) => {
    if (!entry.includes("*")) {
      return entry === url.origin;
    }
    const pattern = new URL(entry);
    if (pattern.protocol !== url.protocol || pattern.port !== url.port) {
      return false;
    }
    const suffix = pattern.hostname.slice(1); // ".stage.hash.ai"
    if (!url.hostname.endsWith(suffix)) {
      return false;
    }
    const label = url.hostname.slice(0, -suffix.length);
    return label.length > 0 && !label.includes(".");
  });
};

export const parseCorsAllowedOrigins = (
  value: string | undefined,
): string[] => {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.some((entry) => entry.length === 0)) {
    throw invalidOriginConfiguration();
  }

  return [...new Set(entries.map(normalizeCorsOrigin))];
};

export const createAgentCors = (
  allowedOrigins: readonly string[],
): MiddlewareHandler => {
  const honoCors = cors({
    origin: (origin) =>
      isAllowedOrigin(allowedOrigins, origin) ? origin : null,
    allowMethods: AGENT_CORS_METHODS,
    allowHeaders: AGENT_CORS_REQUEST_HEADERS,
    exposeHeaders: AGENT_CORS_RESPONSE_HEADERS,
    maxAge: 600,
  });

  return async (context, next) => {
    const isOptions = context.req.method === "OPTIONS";
    const hasOrigin = (context.req.header("Origin")?.trim().length ?? 0) > 0;
    const hasRequestedMethod =
      (context.req.header("Access-Control-Request-Method")?.trim().length ??
        0) > 0;

    if (isOptions && (!hasOrigin || !hasRequestedMethod)) {
      return next();
    }

    return honoCors(context, next);
  };
};
