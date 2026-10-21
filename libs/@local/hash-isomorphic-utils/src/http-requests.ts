import type { OriginProvenance } from "@blockprotocol/type-system";
import type { Request } from "express";

export const hashClientTypes = [
  "web-app",
  "browser-extension",
] as const satisfies OriginProvenance["type"][];

export type HashClientType = (typeof hashClientTypes)[number];

export const hashClientHeaderKey = "x-hash-client-id";

// oxlint-disable-next-line typescript/no-restricted-types -- type guard over an arbitrary header value
export const isHashClientType = (value: unknown): value is HashClientType =>
  hashClientTypes.some((clientType) => clientType === value);

export const getHashClientTypeFromRequest = (
  request: Request,
): OriginProvenance["type"] | undefined => {
  const header = request.headers[hashClientHeaderKey];
  if (header === undefined || header === "") {
    return undefined;
  }

  if (Array.isArray(header)) {
    throw new TypeError(
      `Expected only one ${hashClientHeaderKey} header value, received: ${header.join(", ")}`,
    );
  }

  if (!isHashClientType(header)) {
    throw new TypeError(
      `Unexpected ${hashClientHeaderKey} header value: ${header}. Valid values are: ${hashClientTypes.join(", ")}`,
    );
  }

  return header;
};
