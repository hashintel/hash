import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Configuration } from "@ory/client";
import type { CreateIdentityBody, Identity } from "@ory/kratos-client";
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
  emails: [string, ...string[]];
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

export const isUserEmailVerified = async (
  kratosIdentityId: string,
): Promise<boolean> => {
  const { data: identity } = await kratosIdentityApi.getIdentity({
    id: kratosIdentityId,
  });

  return (
    identity.verifiable_addresses?.some(({ verified }) => verified) ?? false
  );
};

/**
 * Send a verification email using the Kratos self-service verification flow.
 * Uses the native (non-browser) flow to avoid CSRF token requirements.
 */
export const sendVerificationEmail = async (email: string): Promise<void> => {
  const { data: flow } = await kratosFrontendApi.createNativeVerificationFlow();

  await kratosFrontendApi.updateVerificationFlow({
    flow: flow.id,
    updateVerificationFlowBody: {
      method: "code",
      email,
    },
  });
};
