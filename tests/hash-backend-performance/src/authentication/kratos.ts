import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { Configuration, FrontendApi } from "@ory/client";

export type SessionContext = {
  session: {
    token: string;
    expiresAt?: number;
    user: SimpleProperties<User["properties"]> & { password: string };
    ownedById: OwnedById;
  };
};

let __oryKratosClient: FrontendApi | undefined;
export const getOryKratosClient = () => {
  if (!__oryKratosClient) {
    __oryKratosClient = new FrontendApi(
      new Configuration({
        basePath: `${getRequiredEnv("API_ORIGIN")}/auth`,
        baseOptions: {
          withCredentials: true,
        },
      }),
    );
  }

  return __oryKratosClient;
};
