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
const AGENT_CORS_RESPONSE_HEADERS = [
  "flue-error-ref",
  "Stream-Next-Offset",
  "Stream-Cursor",
  "Stream-Up-To-Date",
  "Stream-Closed",
  "stream-sse-data-encoding",
];

const invalidOriginConfiguration = (): Error =>
  new Error(
    `${BRUNCH_CORS_ALLOWED_ORIGINS_ENV} must contain only comma-separated exact HTTP(S) origins`,
  );

const normalizeCorsOrigin = (value: string): string => {
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
    url.hostname.includes("*") ||
    url.origin === "null"
  ) {
    throw invalidOriginConfiguration();
  }

  return url.origin;
};

export const parseCorsAllowedOrigins = (
  value: string | undefined,
): string[] => {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map(normalizeCorsOrigin),
    ),
  ];
};

export const createAgentCors = (
  allowedOrigins: readonly string[],
): MiddlewareHandler =>
  cors({
    origin: [...allowedOrigins],
    allowMethods: AGENT_CORS_METHODS,
    allowHeaders: AGENT_CORS_REQUEST_HEADERS,
    exposeHeaders: AGENT_CORS_RESPONSE_HEADERS,
    maxAge: 600,
  });
