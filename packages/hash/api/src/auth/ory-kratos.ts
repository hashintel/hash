import { Configuration, Identity } from "@ory/client";
import { V0alpha2Api as OpenSourceV0alpha2Api } from "@ory/kratos-client";
import { getRequiredEnv } from "../util";

const publicUrl = getRequiredEnv("ORY_KRATOS_PUBLIC_URL");

export const publicKratosSdk = new OpenSourceV0alpha2Api(
  new Configuration({ basePath: publicUrl }),
);

const adminUrl = getRequiredEnv("ORY_KRATOS_ADMIN_URL");

export const adminKratosSdk = new OpenSourceV0alpha2Api(
  new Configuration({ basePath: adminUrl }),
);

export type KratosUserIdentityTraits = {
  emails: string[];
};

export type KratosUserIdentity = Omit<Identity, "traits"> & {
  traits: KratosUserIdentityTraits;
};
