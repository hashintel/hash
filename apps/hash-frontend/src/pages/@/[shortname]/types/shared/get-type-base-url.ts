import type { BaseUrl } from "@blockprotocol/type-system";
import { frontendUrl } from "@local/hash-isomorphic-utils/environment";
import type { SystemTypeWebShortname } from "@local/hash-isomorphic-utils/ontology-types";
import { systemTypeWebShortnames } from "@local/hash-isomorphic-utils/ontology-types";

export const getTypeBaseUrl = ({
  slug,
  namespaceWithAt,
  kind,
}: {
  slug: string;
  namespaceWithAt: `@${string}`;
  kind: "entity-type" | "data-type";
}): BaseUrl =>
  `${
    /**
     * The localhost:3000/stage.hash.ai condition handles system types correctly having
     * a https://hash.ai generated, despite being served from a different domain.
     */
    (
      systemTypeWebShortnames.includes(
        namespaceWithAt.slice(1) as SystemTypeWebShortname,
      ) &&
        ["http://localhost:3000", "https://stage.hash.ai"].includes(frontendUrl)
    ) ||
    /**
     * @todo H-1172 – Once app is migrated to https://hash.ai, remove this https://app.hash.ai condition.
     * app.hash.ai uses hash.ai as the base domain for ALL types, despite being served from a different domain.
     */
    frontendUrl === "https://app.hash.ai"
      ? "https://hash.ai"
      : frontendUrl
  }/${namespaceWithAt}/types/${kind}/${slug}/` as BaseUrl;
