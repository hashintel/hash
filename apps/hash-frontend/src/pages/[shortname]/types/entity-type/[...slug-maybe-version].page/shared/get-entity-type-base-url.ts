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
    // To be removed in H-1172: Temporary provision to serve system types from https://app.hash.ai
    systemTypeWebShortnames.includes(
      namespaceWithAt.slice(1) as SystemTypeWebShortname,
    ) && ["http://localhost:3000", "https://app.hash.ai"].includes(frontendUrl)
      ? "https://hash.ai"
      : frontendUrl
  }/${namespaceWithAt}/types/entity-type/${slug}/` as BaseUrl;
