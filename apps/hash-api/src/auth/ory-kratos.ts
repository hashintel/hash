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
    /**
     * If true, all emails in the traits will be marked as verified
     * in the created identity. This is useful in tests to bypass
     * email verification requirements.
     */
    verifyEmails?: boolean;
  },
): Promise<KratosUserIdentity> => {
  const { verifyEmails, ...rest } = params;

  const createIdentityBody: CreateIdentityBody = {
    schema_id: "default",
    ...rest,
  };

  if (verifyEmails) {
    createIdentityBody.verifiable_addresses = params.traits.emails.map(
      (email) => ({
        value: email,
        verified: true,
        verified_at: new Date().toISOString(),
        via: "email" as const,
        status: "completed",
      }),
    );
  }

  const { data: kratosUserIdentity } = await kratosIdentityApi.createIdentity({
    createIdentityBody,
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
 * Mark all verifiable email addresses on a Kratos identity as verified
 * using the admin API. This is useful in tests to bypass email verification
 * when the identity was created without `verifyEmails: true`.
 */
export const verifyAllKratosIdentityEmails = async (
  kratosIdentityId: string,
): Promise<void> => {
  const { data: identity } = await kratosIdentityApi.getIdentity({
    id: kratosIdentityId,
  });

  const verifiedAddresses = (identity.verifiable_addresses ?? []).map(
    (address) => ({
      ...address,
      verified: true,
      verified_at: address.verified_at ?? new Date().toISOString(),
      status: "completed",
    }),
  );

  await kratosIdentityApi.patchIdentity({
    id: kratosIdentityId,
    jsonPatch: [
      {
        op: "replace",
        path: "/verifiable_addresses",
        value: verifiedAddresses,
      },
    ],
  });
};
