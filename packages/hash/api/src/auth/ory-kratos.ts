import { Configuration, Identity } from "@ory/client";
import {
  CreateIdentityBody,
  FrontendApi,
  IdentityApi,
} from "@ory/kratos-client";

import { getRequiredEnv } from "../util";

const publicUrl = getRequiredEnv("ORY_KRATOS_PUBLIC_URL");

export const kratosFrontendApi = new FrontendApi(
  new Configuration({ basePath: publicUrl }),
);

const adminUrl = getRequiredEnv("ORY_KRATOS_ADMIN_URL");

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
