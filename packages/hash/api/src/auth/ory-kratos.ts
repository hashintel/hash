import { Configuration } from "@ory/client";
import { V0alpha2Api as OpenSourceV0alpha2Api } from "@ory/kratos-client";
import { getRequiredEnv } from "../util";

/** @todo: connect to admin endpoint when admin methods are required */
const publicUrl = getRequiredEnv("ORY_KRATOS_PUBLIC_URL");

export const kratosSdk = new OpenSourceV0alpha2Api(
  new Configuration({ basePath: publicUrl }),
);
