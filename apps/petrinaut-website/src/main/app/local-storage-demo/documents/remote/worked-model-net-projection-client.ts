import { BRUNCH_PRINCIPAL_HEADER } from "@hashintel/brunch-agent-transport-aisdk/headers";
import {
  parseSDCPNFile,
  type DocumentRevisionId,
  type SDCPN,
} from "@hashintel/petrinaut-core";

export interface WorkedModelNetProjection {
  readonly bundleKey: string;
  readonly copyId: string;
  readonly conversationId: string;
  readonly documentId: string;
  readonly incarnationId: string;
  readonly fixtureVersion: string;
  readonly principalKey: string;
  readonly title: string;
  readonly definition: SDCPN;
  readonly definitionSha256: string;
  readonly revisionId: DocumentRevisionId;
}

const nonBlankString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`Worked-model response has no ${field}.`);
  return value;
};

const definitionFrom = (value: unknown): SDCPN => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Worked-model response has no definition.");
  const parsed = parseSDCPNFile({
    ...value,
    title: "Worked-model net projection",
  });
  if (!parsed.ok) throw new Error(parsed.error);
  const { title: _title, ...definition } = parsed.sdcpn;
  return definition;
};

export const parseWorkedModelNetProjection = (
  value: unknown,
): WorkedModelNetProjection => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Worked-model response is not an object.");
  const netProjection = value as Record<string, unknown>;
  return {
    bundleKey: nonBlankString(netProjection.bundleKey, "bundleKey"),
    copyId: nonBlankString(netProjection.copyId, "copyId"),
    conversationId: nonBlankString(
      netProjection.conversationId,
      "conversationId",
    ),
    documentId: nonBlankString(netProjection.documentId, "documentId"),
    incarnationId: nonBlankString(netProjection.incarnationId, "incarnationId"),
    fixtureVersion: nonBlankString(
      netProjection.fixtureVersion,
      "fixtureVersion",
    ),
    principalKey: nonBlankString(netProjection.principalKey, "principalKey"),
    title: nonBlankString(netProjection.title, "title"),
    definition: definitionFrom(netProjection.definition),
    definitionSha256: nonBlankString(
      netProjection.definitionSha256,
      "definitionSha256",
    ),
    revisionId: nonBlankString(netProjection.revisionId, "revisionId"),
  };
};

export const workedModelApiUrl = (
  chatEndpoint: string,
  currentOrigin: string,
): URL => {
  const url = new URL(chatEndpoint, currentOrigin);
  url.pathname = "/api/worked-models";
  url.search = "";
  url.hash = "";
  return url;
};

const netProjectionRequest = async (
  input: {
    readonly chatEndpoint: string;
    readonly currentOrigin: string;
    readonly principalKey: string;
    readonly path: string;
    readonly method?: "GET" | "POST" | "PUT";
    readonly body?: unknown;
  },
  fetcher: typeof fetch,
): Promise<WorkedModelNetProjection> => {
  const url = workedModelApiUrl(input.chatEndpoint, input.currentOrigin);
  url.pathname = `${url.pathname}${input.path}`;
  const response = await fetcher(url, {
    method: input.method ?? "GET",
    headers: {
      [BRUNCH_PRINCIPAL_HEADER]: input.principalKey,
      ...(input.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Worked-model request failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return parseWorkedModelNetProjection(await response.json());
};

export const resolveNetProjection = (
  input: {
    readonly chatEndpoint: string;
    readonly currentOrigin: string;
    readonly principalKey: string;
    readonly bundleKey: string;
  },
  fetcher: typeof fetch = globalThis.fetch,
): Promise<WorkedModelNetProjection> =>
  netProjectionRequest(
    {
      ...input,
      path: `/bundles/${encodeURIComponent(input.bundleKey)}`,
    },
    fetcher,
  );

export const createCleanNetProjection = (
  input: {
    readonly chatEndpoint: string;
    readonly currentOrigin: string;
    readonly principalKey: string;
    readonly bundleKey: string;
  },
  fetcher: typeof fetch = globalThis.fetch,
): Promise<WorkedModelNetProjection> =>
  netProjectionRequest(
    {
      ...input,
      path: `/bundles/${encodeURIComponent(input.bundleKey)}/copies`,
      method: "POST",
    },
    fetcher,
  );

export const updateNetProjectionDefinition = (
  input: {
    readonly chatEndpoint: string;
    readonly currentOrigin: string;
    readonly principalKey: string;
    readonly copyId: string;
    readonly expectedSha256: string;
    readonly expectedRevisionId: DocumentRevisionId;
    readonly definition: SDCPN;
    readonly revisionId: DocumentRevisionId;
  },
  fetcher: typeof fetch = globalThis.fetch,
): Promise<WorkedModelNetProjection> =>
  netProjectionRequest(
    {
      ...input,
      path: `/copies/${encodeURIComponent(input.copyId)}/definition`,
      method: "PUT",
      body: {
        expectedSha256: input.expectedSha256,
        expectedRevisionId: input.expectedRevisionId,
        definition: input.definition,
        revisionId: input.revisionId,
      },
    },
    fetcher,
  );
