import type { EntityId } from "@local/hash-graph-types/entity";

interface ErrorResponse {
  error: string;
}

export interface GoogleOAuth2CallbackRequest {
  code: string;
}

export type GoogleOAuth2CallbackResponse =
  | { googleAccountEntityId: EntityId }
  | ErrorResponse;

export interface GetGoogleTokenRequest {
  googleAccountId: string;
}

export type GetGoogleTokenResponse =
  | {
      accessToken: string;
    }
  | ErrorResponse;

export interface CheckGoogleTokenRequest {
  googleAccountId: string;
}

export type CheckGoogleTokenResponse =
  | {
      accessToken: boolean;
    }
  | ErrorResponse;
