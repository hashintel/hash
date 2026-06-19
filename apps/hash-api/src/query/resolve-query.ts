import { getActorGroupRole } from "@local/hash-graph-sdk/principal/actor-group";

import { logger } from "../logger";
import {
  DatasetUnavailableError,
  QueryArgError,
  QueryNotFoundError,
} from "./shared/errors";
import { getQuery } from "./shared/query-registry";

import type { GraphApi } from "../graph/context-types";
import type { ActorEntityUuid } from "@blockprotocol/type-system";
import type { FileStorageProvider } from "@local/hash-backend-utils/file-storage";
import type {
  QueryInvocation,
  QueryResult,
} from "@local/hash-isomorphic-utils/query/types";
import type Keyv from "keyv";

/**
 * Presigned URLs are short-lived: the frontend re-queries the gateway when a
 * URL nears expiry rather than holding long-lived credentials. We cache the
 * URL (minus an offset) so repeat queries within the window are cheap.
 */
const QUERY_URL_EXPIRATION_SECONDS = 60 * 60;
const QUERY_URL_CACHE_OFFSET_SECONDS = 60 * 5;

/** Internal sentinel for an authorisation failure on a specific web. */
class WebAuthorisationError extends Error {}

export interface ResolveInvocationParams {
  invocation: QueryInvocation;
  actorId: ActorEntityUuid;
  graphApi: GraphApi;
  uploadProvider: FileStorageProvider;
  cache: Keyv;
}

export const resolveInvocation = async ({
  invocation,
  actorId,
  graphApi,
  uploadProvider,
  cache,
}: ResolveInvocationParams): Promise<QueryResult> => {
  const id = typeof invocation.id === "string" ? invocation.id : "";
  const queryName = invocation.query;
  const webIds = invocation.webIds;
  const args = invocation.args ?? {};

  const asResult = (partial: Omit<QueryResult, "id">): QueryResult => ({
    id,
    ...partial,
  });

  if (typeof queryName !== "string" || queryName.length === 0) {
    return asResult({ status: "error", error: "Missing query name" });
  }

  const query = getQuery(queryName);
  if (!query) {
    return asResult({ status: "error", error: `Unknown query "${queryName}"` });
  }

  if (!Array.isArray(webIds) || webIds.length === 0) {
    return asResult({
      status: "error",
      error: "At least one webId is required",
    });
  }

  const requiredRole = query.requiredWebRole ?? "member";

  try {
    // Authorise the actor against every web the invocation is scoped to.
    for (const webId of webIds) {
      const role = await getActorGroupRole(
        graphApi,
        { actorId },
        { actorId, actorGroupId: webId },
      );

      if (!role) {
        throw new WebAuthorisationError(
          `You do not have access to web ${webId}`,
        );
      }
      if (requiredRole === "administrator" && role !== "administrator") {
        throw new WebAuthorisationError(
          `Administrator role required in web ${webId}`,
        );
      }
    }

    const loadArtifact = async (key: string): Promise<Buffer | null> => {
      try {
        return await uploadProvider.downloadDirect({ key });
      } catch {
        return null;
      }
    };

    const resolution = await query.resolve({
      webId: webIds[0]!,
      webIds,
      args,
      loadArtifact,
    });

    if (resolution.status === "computing") {
      return asResult({
        status: "computing",
        retryAfterMs: resolution.retryAfterMs ?? 1000,
      });
    }

    const artifacts = await Promise.all(
      (resolution.artifacts ?? []).map(async (ref) => {
        const cacheKey = `query-presign:${ref.key}`;
        let url = await cache.get<string>(cacheKey);

        if (!url) {
          url = await uploadProvider.presignDownloadByKey({
            key: ref.key,
            expiresInSeconds: QUERY_URL_EXPIRATION_SECONDS,
          });

          try {
            await cache.set(
              cacheKey,
              url,
              (QUERY_URL_EXPIRATION_SECONDS - QUERY_URL_CACHE_OFFSET_SECONDS) *
                1000,
            );
          } catch (error) {
            logger.warn(
              `Could not cache presigned query URL [key=${ref.key}]: ${error}`,
            );
          }
        }

        return {
          name: ref.name,
          format: ref.format ?? "json",
          url,
          expiresAt: new Date(
            Date.now() + QUERY_URL_EXPIRATION_SECONDS * 1000,
          ).toISOString(),
        };
      }),
    );

    return asResult({ status: "ready", artifacts });
  } catch (error) {
    if (
      error instanceof WebAuthorisationError ||
      error instanceof QueryArgError ||
      error instanceof QueryNotFoundError ||
      error instanceof DatasetUnavailableError
    ) {
      return asResult({ status: "error", error: error.message });
    }

    logger.error(
      `Unexpected error resolving query "${queryName}": ${
        error instanceof Error ? error.stack : String(error)
      }`,
    );
    return asResult({ status: "error", error: "Internal error" });
  }
};
