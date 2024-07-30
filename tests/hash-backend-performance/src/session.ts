import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { Configuration, FrontendApi } from "@ory/client";

import { getUserByKratosIdentityId } from "./graph";
import type { BeforeRequest, RequestParams } from "./types";

const API_ORIGIN = "http://127.0.0.1:5001";

type LoginContext = {
  flowId: string;
  session: {
    token: string;
    expiresAt?: string;
    user: SimpleProperties<User["properties"]>;
    ownedById: OwnedById;
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

  const user = await getUserByKratosIdentityId({
    authentication: { actorId: publicUserAccountId },
    kratosIdentityId: fullLogin.session.identity.id,
  });
  if (!user) {
    throw new Error("User not found");
  }

  context.vars.session = {
    token: fullLogin.session_token,
    expiresAt: fullLogin.session.expires_at,
    user: simplifyProperties(user.properties),
    ownedById: extractOwnedByIdFromEntityId(user.entityId),
  };
  setAuthorizationHeader(request, context.vars.session.token);
};
