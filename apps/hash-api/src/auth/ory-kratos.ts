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
 * Store the Graph actor identifier in Kratos admin metadata.
 *
 * This metadata is written only through Kratos's admin API, so it cannot be
 * changed by an identity through a self-service flow. Repeating a write for
 * the same actor is safe; a different existing actor is an invariant breach.
 */
export const provisionGraphActorIdInKratos = async (params: {
  graphActorId: string;
  kratosIdentityId: string;
}): Promise<void> => {
  const { graphActorId, kratosIdentityId } = params;
  const { data: identity } = await kratosIdentityApi.getIdentity({
    id: kratosIdentityId,
  });

  const metadataAdmin =
    identity.metadata_admin && typeof identity.metadata_admin === "object"
      ? identity.metadata_admin
      : {};
  const existingGraphActorId = metadataAdmin[graphActorIdMetadataKey];

  if (existingGraphActorId === graphActorId) {
    return;
  }

  if (existingGraphActorId !== undefined) {
    throw new Error(
      `Kratos identity "${kratosIdentityId}" is already provisioned for a different Graph actor.`,
    );
  }

  if (!identity.state) {
    throw new Error(
      `Kratos identity "${kratosIdentityId}" has no state and cannot be updated.`,
    );
  }

  await kratosIdentityApi.updateIdentity({
    id: kratosIdentityId,
    updateIdentityBody: {
      schema_id: identity.schema_id,
      state: identity.state,
      traits: identity.traits,
      metadata_admin: {
        ...metadataAdmin,
        [graphActorIdMetadataKey]: graphActorId,
      },
    },
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
