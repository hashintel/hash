import type { EntityId } from "@local/hash-graph-types/entity";

type ErrorResponse = { error: string };

export type GoogleOAuth2CallbackRequest = {
  code: string;
};

export type GoogleOAuth2CallbackResponse =
  | { googleAccountEntityId: EntityId }
  | ErrorResponse;

export type GetGoogleTokenRequest = {
  googleAccountId: string;
};

export type GetGoogleTokenResponse =
  | {
      accessToken: string;
    }
  | ErrorResponse;

export type CheckGoogleTokenRequest = {
  googleAccountId: string;
};

export type CheckGoogleTokenResponse =
  | {
      accessToken: boolean;
    }
  | ErrorResponse;
