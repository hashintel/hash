import { Configuration, FrontendApi } from "@ory/client";

import type { BeforeRequest, RequestParams } from "./types";

const API_ORIGIN = "http://127.0.0.1:5001";

type LoginContext = {
  flowId: string;
  session: {
    token: string;
    expiresAt?: string;
  };
};

const setAuthorizationHeader = (request: RequestParams, token: string) => {
  if (!request.headers) {
    request.headers = {};
  }
  request.headers.Authorization = `Bearer ${token}`;
};

export const refreshSessionToken: BeforeRequest<LoginContext> = async (
  request,
  context,
) => {
  if (context.vars.session) {
    if (context.vars.session.expiresAt) {
      if (context.vars.session.expiresAt > new Date().toISOString()) {
        setAuthorizationHeader(request, context.vars.session.token);
        return;
      }
    } else {
      setAuthorizationHeader(request, context.vars.session.token);
      return;
    }
  }

  const oryKratosClient = new FrontendApi(
    new Configuration({
      basePath: `${API_ORIGIN}/auth`,
      baseOptions: {
        withCredentials: true,
      },
    }),
  );

  if (!context.vars.flowId) {
    const loginFlow = await oryKratosClient
      .createNativeLoginFlow()
      .then(({ data }) => data);

    context.vars.flowId = loginFlow.id;
  }

  const fullLogin = await oryKratosClient
    .updateLoginFlow({
      flow: context.vars.flowId,
      updateLoginFlowBody: {
        method: "password",
        password_identifier: "email",
        identifier: "alice@example.com",
        password: "password",
      },
    })
    .then(({ data }) => data);
  if (!fullLogin.session_token) {
    throw new Error("Login failed");
  }

  context.vars.session = {
    token: fullLogin.session_token,
    expiresAt: fullLogin.session.expires_at,
  };
  setAuthorizationHeader(request, context.vars.session.token);
};
