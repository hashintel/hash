import type { AuthenticationContext } from "./authentication-context.js";
import type { Brand, Timestamp } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type {
  ApiTokenResponse as ApiTokenResponseGraphApi,
  ApiTokenStatus,
  CreateApiTokenRequest,
  CreateApiTokenResponse as CreateApiTokenResponseGraphApi,
  GraphApi,
} from "@local/hash-graph-client";

export type { ApiTokenStatus, CreateApiTokenRequest };

export type ApiTokenId = Brand<string, "ApiTokenId">;

/**
 * An API token of the authenticated user, without its secret.
 */
export type ApiTokenResponse = Subtype<
  ApiTokenResponseGraphApi,
  {
    tokenId: ApiTokenId;
    hint: string;
    name: string;
    status: ApiTokenStatus;
    createdAt: Timestamp;
    expiresAt: Timestamp | null;
    lastUsedAt: Timestamp | null;
    revokedAt: Timestamp | null;
  }
>;

/**
 * A newly created API token.
 *
 * `token` is the complete token. No other response contains it.
 */
export type CreateApiTokenResponse = Subtype<
  CreateApiTokenResponseGraphApi,
  {
    token: string;
    apiToken: ApiTokenResponse;
  }
>;

/**
 * Creates an API token for the authenticated user.
 */
export const createApiToken = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  params: CreateApiTokenRequest,
): Promise<CreateApiTokenResponse> =>
  graphAPI
    .createApiToken(authentication.actorId, params)
    .then(({ data }) => data as CreateApiTokenResponse);

/**
 * Returns the API tokens of the authenticated user, newest first, including expired and revoked
 * tokens.
 */
export const listApiTokens = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
): Promise<ApiTokenResponse[]> =>
  graphAPI
    .listApiTokens(authentication.actorId)
    .then(({ data }) => data as ApiTokenResponse[]);

/**
 * Revokes the API token `tokenId` of the authenticated user.
 *
 * Revoking a revoked token succeeds and keeps its first revocation time.
 */
export const revokeApiToken = (
  graphAPI: GraphApi,
  authentication: AuthenticationContext,
  tokenId: ApiTokenId,
): Promise<void> =>
  graphAPI.revokeApiToken(authentication.actorId, tokenId).then(() => {});
