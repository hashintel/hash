export type CreateSheetsIntegrationRequest = {};

export type CreateSheetsIntegrationResponse = {};

export type GoogleOAuth2CallbackRequest = {};

export type GoogleOAuth2CallbackResponse = {};

type ErrorResponse = { error: string };

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
