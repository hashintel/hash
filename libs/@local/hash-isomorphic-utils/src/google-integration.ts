import type { EntityId } from "@local/hash-subgraph";

type ErrorResponse = { error: string };

export type CreateOrUpdateSheetsIntegrationRequest = {
  audience: "human" | "machine";
  existingIntegrationEntityId?: EntityId;
  googleAccountId: string;
  queryEntityId: EntityId;
  spreadsheetId?: string;
  newFileName?: string;
};

export type CreateOrUpdateSheetsIntegrationResponse =
  | {
      integrationEntityId: EntityId;
    }
  | ErrorResponse;

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
