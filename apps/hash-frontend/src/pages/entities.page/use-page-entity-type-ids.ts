import { useMemo } from "react";

import { atLeastOne, extractBaseUrl } from "@blockprotocol/type-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useEnabledPageKinds } from "../shared/use-enabled-page-kinds";

import type { VersionedUrl } from "@blockprotocol/type-system";

/**
 * The entity types listed on /pages: every version of the type behind each
 * kind of page the user can use.
 */
export const usePageEntityTypeIds = (): {
  loading: boolean;
  /** Not set while the types are loading, or when no kind of page is usable. */
  pageEntityTypeIds?: [VersionedUrl, ...VersionedUrl[]];
} => {
  const { entityTypes } = useEntityTypesContextRequired();
  const enabledPageKinds = useEnabledPageKinds();

  const pageEntityTypeIds = useMemo(() => {
    const enabledBaseUrls = [
      ...(enabledPageKinds.blockPages
        ? [systemEntityTypes.page.entityTypeBaseUrl]
        : []),
      ...(enabledPageKinds.dashboards
        ? [systemEntityTypes.dashboard.entityTypeBaseUrl]
        : []),
    ];

    return atLeastOne(
      (entityTypes ?? [])
        .map(({ schema }) => schema.$id)
        .filter((entityTypeId) =>
          enabledBaseUrls.includes(extractBaseUrl(entityTypeId)),
        ),
    );
  }, [entityTypes, enabledPageKinds]);

  return { loading: entityTypes === null, pageEntityTypeIds };
};
