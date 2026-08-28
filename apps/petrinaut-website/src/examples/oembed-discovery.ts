import { PETRINAUT_DEMO_ORIGIN } from "./catalog-metadata";
import { canonicalSearchString } from "./example-search";

import type { SharedExampleSearch } from "./example-search";

/**
 * Builds the oEmbed endpoint URL a consumer should call for this example.
 *
 * The advertised `url` is rebuilt from the slug and the validated search
 * rather than copied from the address bar, so a tracking parameter on the page
 * does not advertise a distinct endpoint URL for a byte-identical response.
 */
export const getOEmbedDiscoveryUrl = (
  slug: string,
  search: SharedExampleSearch,
): string => {
  const sourceUrl = new URL(`/examples/${slug}`, PETRINAUT_DEMO_ORIGIN);
  sourceUrl.search = canonicalSearchString(search);

  const endpointUrl = new URL("/api/oembed", PETRINAUT_DEMO_ORIGIN);
  endpointUrl.searchParams.set("url", sourceUrl.href);
  endpointUrl.searchParams.set("format", "json");

  return endpointUrl.href;
};
