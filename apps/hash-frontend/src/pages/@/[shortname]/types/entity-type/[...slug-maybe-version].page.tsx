import type {
  ActorEntityUuid,
  EntityTypeWithMetadata,
  WebId,
} from "@blockprotocol/type-system";
import {
  componentsFromVersionedUrl,
  currentTimestamp,
  parseOntologyTypeVersion,
} from "@blockprotocol/type-system";
import { GlobalStyles } from "@mui/system";
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { useMemo } from "react";

import type { NextPageWithLayout } from "../../../../../shared/layout";
import { getLayoutWithSidebar } from "../../../../../shared/layout";
import { EntityType } from "../../../../shared/entity-type";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { getTypeBaseUrl } from "../shared/get-type-base-url";

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
  const [
    _,
    shortnameWithAt,
    _types,
    _entityType,
    slug,
    _v,
    requestedVersionString,
  ] = router.asPath.split("/") as [
    "",
    `@${string}`,
    "types",
    "entity-type",
    string,
    "v" | undefined,
    string | undefined,
  ];

  const entityTypeBaseUrl = !isDraft
    ? getTypeBaseUrl({
        slug,
        namespaceWithAt: shortnameWithAt,
        kind: "entity-type",
      })
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
          temporalVersioning: {
            transactionTime: {
              start: {
                kind: "inclusive",
                limit: currentTimestamp(),
              },
              end: { kind: "unbounded" },
            },
          },
          provenance: {
            edition: {
              createdById: "irrelevant-here" as ActorEntityUuid,
              actorType: "user",
              origin: {
                type: "web-app",
              },
            },
          },
          webId: "irrelevant-here" as WebId,
        },
        schema: entityTypeSchema,
      } satisfies EntityTypeWithMetadata;
    } else {
      return null;
    }
  }, [router.query.draft]);

  const requestedVersion = requestedVersionString
    ? parseOntologyTypeVersion(requestedVersionString)
    : null;

  if (!routeNamespace) {
    if (loadingNamespace) {
      return null;
    } else {
      throw new Error("Namespace for entity type somehow missing");
    }
  }

  return (
    <>
      <EntityType
        isInSlide={false}
        webId={routeNamespace.webId}
        draftEntityType={draftEntityType}
        entityTypeBaseUrl={entityTypeBaseUrl}
        key={`${entityTypeBaseUrl}-${requestedVersion?.toString()}`}
        requestedVersion={requestedVersion}
      />
      <GlobalStyles
        styles={{
          body: {
            overflowY: "scroll",
          },
        }}
      />
    </>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
