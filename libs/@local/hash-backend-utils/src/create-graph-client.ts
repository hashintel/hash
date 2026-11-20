import { Agent } from "undici";

import { getGraph } from "@local/hash-graph-client";
import { convertHttpCodeToStatusCode, isStatus } from "@local/status";

import { getRequiredEnv } from "./environment.js";

import type { Logger } from "./logger.js";
import type { GraphApi } from "@local/hash-graph-client";
import type { Status } from "@local/status";

const dispatcher = new Agent({
  connections: 128,
  keepAliveTimeout: 30 * 1000, // ms
  headersTimeout: 60 * 1000, // ms
  bodyTimeout: 60 * 1000, // ms
});

type GraphStatus = Status<Record<string, unknown>>;

class GraphApiError extends Error {
  status: GraphStatus;

  constructor(status: GraphStatus, message = status.message) {
    super(message);
    this.status = status;
  }
}

/**
 * Builds the error for a non-2xx response. The Graph answers with a `Status`
 * as JSON; any other body (e.g. a plain-text rejection) is wrapped in one.
 */
const graphApiErrorFromResponse = (httpStatus: number, body: string) => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (isStatus(parsed)) {
      return new GraphApiError(parsed);
    }
  } catch {
    // Not JSON, so not a `Status`.
  }

  return new GraphApiError(
    {
      message: body,
      code: convertHttpCodeToStatusCode(httpStatus),
      contents: [{ reason: "UNKNOWN", domain: "HASH Graph", metadata: {} }],
    },
    `Error from Graph API: ${body}`,
  );
};

export const createGraphClient = (
  _logger: Logger,
  { host, port }: { host: string; port: number },
): GraphApi => {
  const basePath = `http://${host}:${port}`;
  // The Graph only honors `X-Authenticated-User-Actor-Id` next to this credential.
  const authorization = `HASH-Service ${getRequiredEnv("HASH_GRAPH_SERVICE_SECRET")}`;

  const graphFetch: typeof fetch = async (path, init) => {
    if (typeof path !== "string") {
      throw new TypeError("Graph API request path should be a string");
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", authorization);

    // Node's `fetch` takes an undici `dispatcher`, which the DOM `RequestInit` type lacks.
    const requestInit: RequestInit & { dispatcher: Agent } = {
      ...init,
      headers,
      dispatcher,
    };

    const response = await fetch(`${basePath}${path}`, requestInit).catch(
      (error: unknown) => {
        // `fetch` rejects with a bare "fetch failed"; its cause says why.
        const reason =
          error instanceof Error && error.cause instanceof Error
            ? error.cause
            : error;
        throw new Error(
          `No response from Graph API at ${basePath}: ${reason instanceof Error ? reason.message : String(reason)}`,
          { cause: error },
        );
      },
    );

    if (!response.ok) {
      throw graphApiErrorFromResponse(response.status, await response.text());
    }

    return response;
  };

  return getGraph(graphFetch);
};
