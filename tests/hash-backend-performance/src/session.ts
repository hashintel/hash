import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { Configuration, FrontendApi } from "@ory/client";

import { getUserByKratosIdentityId } from "./graph";
import type { ActionFn, BeforeRequestFn } from "./types";

const API_ORIGIN = "http://127.0.0.1:5001";

type LoginContext = {
  session: {
    token: string;
    expiresAt?: number;
    user: SimpleProperties<User["properties"]>;
    ownedById: OwnedById;
  };
};

let __oryKratosClient: FrontendApi | undefined;
const getOryKratosClient = () => {
  if (!__oryKratosClient) {
    __oryKratosClient = new FrontendApi(
      new Configuration({
        basePath: `${API_ORIGIN}/auth`,
        baseOptions: {
          withCredentials: true,
        },
      }),
    );
  }

  return __oryKratosClient;
};

export const login: ActionFn<LoginContext> = async (context) => {
  const oryKratosClient = getOryKratosClient();

  const loginFlow = await oryKratosClient
    .createNativeLoginFlow()
    .then(({ data }) => data);

  const fullLogin = await oryKratosClient
    .updateLoginFlow({
      flow: loginFlow.id,
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
    expiresAt: fullLogin.session.expires_at
      ? new Date(fullLogin.session.expires_at).valueOf()
      : undefined,
    user: simplifyProperties(user.properties),
    ownedById: extractOwnedByIdFromEntityId(user.entityId),
  };
};

export const refreshSessionToken: BeforeRequestFn<LoginContext> = async (
  request,
  context,
  events,
) => {
  if (
    !context.vars.session ||
    (context.vars.session.expiresAt &&
      context.vars.session.expiresAt > Date.now())
  ) {
    await login(context, events);
  }

  request.headers ??= {};
  request.headers.Authorization = `Bearer ${context.vars.session!.token}`;
};
