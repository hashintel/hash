import type { OriginProvenance } from "@blockprotocol/type-system";
import type { Request } from "express";

export const hashClientTypes = [
  "web-app",
  "browser-extension",
] as const satisfies OriginProvenance["type"][];

export type HashClientType = (typeof hashClientTypes)[number];

export const hashClientHeaderKey = "x-hash-client-id";

export const isHashClientType = (value: unknown): value is HashClientType =>
  hashClientTypes.includes(value as HashClientType);

export const getHashClientTypeFromRequest = (
  request: Request,
): OriginProvenance["type"] | undefined => {
  const header = request.headers[hashClientHeaderKey];
  if (!header) {
    return undefined;
  }

  if (Array.isArray(header)) {
    throw new Error(
      `Expected only one ${hashClientHeaderKey} header value, received: ${header.join(", ")}`,
    );
  }

  if (!isHashClientType(header)) {
    throw new Error(
      `Unexpected ${hashClientHeaderKey} header value: ${header}. Valid values are: ${hashClientTypes.join(", ")}`,
    );
  }

  return header;
};

/**
 * The most characters the Graph accepts in a text field of an edition's origin.
 */
const maxOriginTextLength = 255;

/**
 * The `User-Agent` header of `request`, cut to the length the Graph accepts.
 */
export const getUserAgentFromRequest = (request: Request): string | undefined =>
  request.headers["user-agent"]?.slice(0, maxOriginTextLength);
