import type { ProvidedEntityEditionProvenanceOriginTypeEnum } from "@local/hash-graph-client";
import type { Request } from "express";

export const hashClientTypes = [
  // @ts-expect-error –– ProvidedEntityEditionProvenanceOriginTypeEnum is not generated correctly in the hash-graph-client
  "web-app",
  // @ts-expect-error –– ProvidedEntityEditionProvenanceOriginTypeEnum is not generated correctly in the hash-graph-client
  "browser-extension",
] as const satisfies ProvidedEntityEditionProvenanceOriginTypeEnum[];

export type HashClientType = (typeof hashClientTypes)[number];

export const hashClientHeaderKey = "x-hash-client-id";

export const isHashClientType = (value: unknown): value is HashClientType =>
  hashClientTypes.includes(value as HashClientType);

export const getHashClientTypeFromRequest = (
  request: Request,
): ProvidedEntityEditionProvenanceOriginTypeEnum | undefined => {
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

  // @ts-expect-error –– ProvidedEntityEditionProvenanceOriginTypeEnum is not generated correctly in the hash-graph-client
  return header;
};
