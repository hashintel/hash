import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import {
  SystemTypeWebShortname,
  systemTypeWebShortnames,
} from "@local/hash-isomorphic-utils/ontology-types";
import { BaseUrl } from "@local/hash-subgraph";

export const getEntityTypeBaseUrl = (
  slug: string,
  namespaceWithAt: string,
): BaseUrl =>
  `${
    // To be removed in H-1172: Temporary provision until https://app.hash.ai migrated to https://hash.ai
    // To be replaced with simply 'frontendUrl'
    (systemTypeWebShortnames.includes(
      namespaceWithAt.slice(1) as SystemTypeWebShortname,
    ) &&
      frontendUrl === "http://localhost:3000") ||
    frontendUrl === "https://app.hash.ai"
      ? "https://hash.ai"
      : frontendUrl
  }/${namespaceWithAt}/types/entity-type/${slug}/` as BaseUrl;
