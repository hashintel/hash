// @ory/integrations offers a package for integrating with NextJS.
import { config, createApiHandler } from "@ory/integrations/next-edge";

// We need to export the config.
export { config };

const publicUrl = process.env.ORY_KATROS_PUBLIC_URL;

// And create the Ory Cloud API "bridge".
export default createApiHandler({
  apiBaseUrlOverride: publicUrl,
});
