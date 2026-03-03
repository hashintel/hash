import type { WebId } from "@blockprotocol/type-system";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { Configuration, FrontendApi } from "@ory/client";

export type SessionContext = {
  session: {
    token: string;
    expiresAt?: number;
    user: SimpleProperties<User["properties"]> & { password: string };
    webId: WebId;
  };
};

let __oryKratosClient: FrontendApi | undefined;
export const getOryKratosClient = () => {
  __oryKratosClient ??= new FrontendApi(
    new Configuration({
      basePath: `${getRequiredEnv("API_ORIGIN")}/auth`,
      baseOptions: {
        withCredentials: true,
      },
    }),
  );

  return __oryKratosClient;
};
