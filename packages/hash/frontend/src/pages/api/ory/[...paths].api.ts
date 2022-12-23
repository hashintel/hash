// @ory/integrations offers a package for integrating with NextJS.
import {
  frontendDomain,
  oryKratosPublicUrl,
} from "@hashintel/hash-shared/environment";
import { config, createApiHandler } from "@ory/integrations/next-edge";

// We need to export the config.
export { config };

const forceCookieDomain =
  process.env.FRONTEND_FORCE_COOKIE_DOMAIN ?? frontendDomain;

// And create the Ory Cloud API "bridge".
export default createApiHandler({
  apiBaseUrlOverride: oryKratosPublicUrl,
  forceCookieDomain,
});
