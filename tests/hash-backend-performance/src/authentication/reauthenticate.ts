import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";

import { getUserByKratosIdentityId } from "../graph/user";
import type { SessionContext } from "./kratos";
import { getOryKratosClient } from "./kratos";

export const reauthenticate = async (
  session: SessionContext["session"],
): Promise<SessionContext["session"]> => {
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
        identifier: session.user.email[0],
        password: session.user.password,
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

  return {
    ...session,
    token: fullLogin.session_token,
    expiresAt: fullLogin.session.expires_at
      ? new Date(fullLogin.session.expires_at).valueOf()
      : undefined,
  };
};
