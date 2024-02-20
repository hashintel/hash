import { Configuration, OAuth2Api } from "@ory/hydra-client";

const configuration = new Configuration({
  basePath: process.env.HASH_HYDRA_ADMIN_URL,
});

const hydraAdmin = new OAuth2Api(configuration);

export const hydraPublicUrl = process.env.HASH_HYDRA_PUBLIC_URL;

export { hydraAdmin };
