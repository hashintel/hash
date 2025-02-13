import type { EntityTypeWithMetadata } from "@blockprotocol/graph";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { useMemo } from "react";

import type { NextPageWithLayout } from "../../../../../shared/layout";
import { getLayoutWithSidebar } from "../../../../../shared/layout";
import { EntityTypePage } from "../../../../shared/entity-type-page";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { getEntityTypeBaseUrl } from "../shared/get-entity-type-base-url";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const isDraft = !!router.query.draft;
  const { loading: loadingNamespace, routeNamespace } = useRouteNamespace();

  /**
   * router.query is not populated in this page, probably some combination of the rewrite @[shortname] routes and the fact this is a catch all.
   * We have to parse out the path ourselves.
   *
   * @see https://github.com/vercel/next.js/issues/50212 –– possibly related
   *
   * @example /@hash/types/entity-type/user/v/1
   * @example /@hash/types/entity-type/user
   */
  const [_, shortname, _types, _entityType, slug, _v, requestedVersionString] =
    router.asPath.split("/") as [
      "",
      `@${string}`,
      "types",
      "entity-type",
      string,
      "v" | undefined,
      `${number}` | undefined,
    ];

  const entityTypeBaseUrl = !isDraft
    ? getEntityTypeBaseUrl(slug, shortname)
    : undefined;

  const draftEntityType = useMemo(() => {
    if (router.query.draft) {
      const entityTypeSchema = JSON.parse(
        Buffer.from(
          decodeURIComponent(router.query.draft.toString()),
          "base64",
        ).toString("utf8"),
      );

      const { baseUrl, version } = componentsFromVersionedUrl(
        entityTypeSchema.$id,
      );

      return {
        metadata: {
          recordId: {
            baseUrl,
            version,
          },
        },
        schema: entityTypeSchema,
      } satisfies EntityTypeWithMetadata;
    } else {
      return null;
    }
  }, [router.query.draft]);

  const requestedVersion = requestedVersionString
    ? parseInt(requestedVersionString, 10)
    : null;

  if (!routeNamespace) {
    if (loadingNamespace) {
      return null;
    } else {
      throw new Error("Namespace for entity type somehow missing");
    }
  }

  return (
    <EntityTypePage
      ownedById={routeNamespace.ownedById}
      draftEntityType={draftEntityType}
      entityTypeBaseUrl={entityTypeBaseUrl}
      key={`${entityTypeBaseUrl}-${requestedVersion}`}
      requestedVersion={requestedVersion}
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
