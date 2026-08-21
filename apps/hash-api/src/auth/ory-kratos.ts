import { Configuration } from "@ory/client";
import { FrontendApi, IdentityApi } from "@ory/kratos-client";

import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { normalizeEmail } from "@local/hash-isomorphic-utils/normalize";

import type { CreateIdentityBody, Identity } from "@ory/kratos-client";

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

export const getVerifiedEmailsFromKratosIdentity = (
  identity: Pick<Identity, "verifiable_addresses">,
): string[] =>
  (identity.verifiable_addresses ?? [])
    .filter((address) => address.verified === true)
    .map(({ value }) => normalizeEmail(value));

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

const graphActorIdMetadataKey = "graph_actor_id";

/**
 * Read the Graph actor identifier in a Kratos identity's public metadata, or
 * `null` when it carries none.
 */
export const getGraphActorIdFromKratos = async (params: {
  kratosIdentityId: string;
}): Promise<string | null> => {
  const { data: identity } = await kratosIdentityApi.getIdentity({
    id: params.kratosIdentityId,
  });

  const metadataPublic = identity.metadata_public as
    | Record<string, string>
    | null
    | undefined;

  return metadataPublic?.[graphActorIdMetadataKey] ?? null;
};

/**
 * Store the Graph actor identifier in Kratos public metadata, where it maps a
 * Kratos identity to the Graph actor that authorizes its requests.
 *
 * Public metadata is part of the `/sessions/whoami` payload, so validating a
 * session and learning the actor are one answer. Only Kratos's admin API can
 * write it, which keeps the actor out of reach of a self-service flow.
 *
 * A write of the actor already stored is a no-op. A mismatch throws rather
 * than overwriting.
 */
export const provisionGraphActorIdInKratos = async (params: {
  graphActorId: string;
  kratosIdentityId: string;
}): Promise<void> => {
  const { graphActorId, kratosIdentityId } = params;

  const existingGraphActorId = await getGraphActorIdFromKratos({
    kratosIdentityId,
  });

  if (existingGraphActorId === graphActorId) {
    return;
  }

  if (existingGraphActorId !== null) {
    throw new Error(
      `Kratos identity "${kratosIdentityId}" is provisioned for Graph actor "${existingGraphActorId}", not "${graphActorId}".`,
    );
  }

  await kratosIdentityApi.patchIdentity({
    id: kratosIdentityId,
    jsonPatch: [
      {
        op: "add",
        path: `/metadata_public/${graphActorIdMetadataKey}`,
        value: graphActorId,
      },
    ],
  });
};

export const isUserEmailVerified = async (
  kratosIdentityId: string,
): Promise<boolean> => {
  const { data: identity } = await kratosIdentityApi.getIdentity({
    id: kratosIdentityId,
  });

  return getVerifiedEmailsFromKratosIdentity(identity).length > 0;
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
