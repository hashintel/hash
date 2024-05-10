import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import type { Identity } from "@ory/client";
import { Configuration } from "@ory/client";
import type { CreateIdentityBody } from "@ory/kratos-client";
import { FrontendApi, IdentityApi } from "@ory/kratos-client";

export const kratosPublicUrl = getRequiredEnv("HASH_KRATOS_PUBLIC_URL");

export const kratosFrontendApi = new FrontendApi(
  new Configuration({ basePath: kratosPublicUrl }),
);

const adminUrl = getRequiredEnv("HASH_KRATOS_ADMIN_URL");

export const kratosIdentityApi = new IdentityApi(
  new Configuration({ basePath: adminUrl }),
);

export type KratosUserIdentityTraits = {
  shortname?: string;
  emails: string[];
};

export type KratosUserIdentity = Omit<Identity, "traits"> & {
  traits: KratosUserIdentityTraits;
};

export const createKratosIdentity = async (
  params: Omit<CreateIdentityBody, "schema_id" | "traits"> & {
    traits: KratosUserIdentityTraits;
  },
): Promise<KratosUserIdentity> => {
  const { data: kratosUserIdentity } = await kratosIdentityApi.createIdentity({
    createIdentityBody: {
      schema_id: "default",
      ...params,
    },
  });

  return kratosUserIdentity;
};

export const deleteKratosIdentity = async (params: {
  kratosIdentityId: string;
}): Promise<void> => {
  await kratosIdentityApi.deleteIdentity({
    id: params.kratosIdentityId,
  });
};
