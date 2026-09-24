import {
  parseWorkedModelNetProjection,
  type WorkedModelNetProjection,
  type WorkedModelNetProjectionDefinitionUpdate,
} from "@hashintel/brunch-agent-plugin-sdcpn/worked-model";
import { brunchHeaders, brunchRoutes } from "@hashintel/brunch-agent/constants";

export { parseWorkedModelNetProjection, type WorkedModelNetProjection };

export const workedModelApiUrl = (
  chatEndpoint: string,
  currentOrigin: string,
): URL => {
  const url = new URL(chatEndpoint, currentOrigin);
  url.pathname = brunchRoutes.workedModels;
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
      [brunchHeaders.principal]: input.principalKey,
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
  } & WorkedModelNetProjectionDefinitionUpdate,
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
