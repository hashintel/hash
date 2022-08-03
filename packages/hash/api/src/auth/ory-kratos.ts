import { Configuration } from "@ory/client";
import { V0alpha2Api as OpenSourceV0alpha2Api } from "@ory/kratos-client";
import { getRequiredEnv } from "../util";

const apiBaseUrlInternal = getRequiredEnv("ORY_SDK_URL");

export const apiBaseUrl = process.env.KRATOS_BROWSER_URL || apiBaseUrlInternal;

export const kratosSdk = new OpenSourceV0alpha2Api(
  new Configuration({ basePath: apiBaseUrlInternal }),
);
