import { cors } from "hono/cors";

import { brunchHeaders } from "@hashintel/brunch-agent";

import { brunchEnv } from "../../env.ts";

import type { MiddlewareHandler } from "hono";

const AGENT_CORS_METHODS = ["GET", "POST", "OPTIONS"];
const AGENT_CORS_REQUEST_HEADERS = [
  "Content-Type",
  brunchHeaders.actor,
  // Temporary, as Brunch reads it: until no browser sends the former name.
  brunchHeaders.legacyPrincipal,
  brunchHeaders.conversation,
];
/**
 * The HASH route's request headers. Its client still sends the actor header,
 * which the route ignores; no HASH client sends the former name.
 */
const HASH_CORS_REQUEST_HEADERS = [
  "Content-Type",
  brunchHeaders.actor,
  brunchHeaders.conversation,
];
/**
 * Response headers a cross-origin browser must be able to read: the
 * durable-streams client reads its next offset, cursor and up-to-date state
 * from the `stream-*` headers, and a conversation's admission names its
 * instance in `location`.
 */
const AGENT_CORS_RESPONSE_HEADERS = [
  "location",
  "stream-next-offset",
  "stream-cursor",
  "stream-up-to-date",
  "stream-closed",
  "stream-sse-data-encoding",
  "flue-error-ref",
];
// Enforce exact lexical origins before WHATWG URL parsing normalizes forgiving separator forms.
const exactHttpOriginPattern =
  /^https?:\/\/(?:\[[0-9a-f:.]+\]|[^\s:/?#@\\]+)(?::[0-9]+)?\/?$/iu;

// One wildcard label in front of a domain with at least two labels: `*.stage.hash.ai`, never `*.ai`.
const wildcardHostPattern = /^\*\.[^.*]+(?:\.[^.*]+)+$/u;

type OriginListOptions = {
  /** The variable the list comes from, named in configuration errors. */
  readonly variable: string;
  /** Whether an entry may be a one-label wildcard. */
  readonly wildcards: boolean;
};

const invalidConfiguration = ({
  variable,
  wildcards,
}: OriginListOptions): Error =>
  new Error(
    wildcards
      ? `${variable} must contain only comma-separated exact HTTP(S) origins, optionally with one leading wildcard label such as https://*.example.com`
      : `${variable} must contain only comma-separated exact HTTP(S) origins`,
  );

const normalizeCorsOrigin = (
  value: string,
  options: OriginListOptions,
): string => {
  const invalidOriginConfiguration = () => invalidConfiguration(options);
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

  if (
    url.hostname.includes("*") &&
    (!options.wildcards || !wildcardHostPattern.test(url.hostname))
  ) {
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

/**
 * `BRUNCH_CORS_ALLOWED_ORIGINS` by default; pass the HASH route's variable and
 * `wildcards: false` for its list.
 */
export const parseCorsAllowedOrigins = (
  value: string | undefined,
  options: OriginListOptions = {
    variable: brunchEnv.corsAllowedOrigins,
    wildcards: true,
  },
): string[] => {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.some((entry) => entry.length === 0)) {
    throw invalidConfiguration(options);
  }

  return [
    ...new Set(entries.map((entry) => normalizeCorsOrigin(entry, options))),
  ];
};

/**
 * CORS for one agent's routes. With `sessionCredentials`, for the HASH route
 * alone: the allowed origins may send the user's HASH session cookie and read
 * the answers to it, so that list holds HASH's exact origins and nothing else.
 * Every request under the agent's mount but the identity route must carry
 * the conversation header, so a page on another origin, even one the
 * cookie's domain covers, is stopped at the preflight before Brunch acts on
 * it. The identity route needs no header but changes nothing, and CORS keeps
 * its answer from such a page.
 */
export const createAgentCors = (
  allowedOrigins: readonly string[],
  {
    sessionCredentials = false,
  }: { readonly sessionCredentials?: boolean } = {},
): MiddlewareHandler => {
  const honoCors = cors({
    origin: (origin) =>
      isAllowedOrigin(allowedOrigins, origin) ? origin : null,
    allowMethods: AGENT_CORS_METHODS,
    allowHeaders: sessionCredentials
      ? HASH_CORS_REQUEST_HEADERS
      : AGENT_CORS_REQUEST_HEADERS,
    exposeHeaders: AGENT_CORS_RESPONSE_HEADERS,
    credentials: sessionCredentials,
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
