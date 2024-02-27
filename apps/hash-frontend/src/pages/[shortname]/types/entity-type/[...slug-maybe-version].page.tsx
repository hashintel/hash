import { EntityTypeWithMetadata } from "@blockprotocol/graph";
import { validateEntityType } from "@blockprotocol/type-system";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { useMemo } from "react";

import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../../shared/layout";
import { EntityTypePage } from "../../../shared/entity-type-page";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { getEntityTypeBaseUrl } from "./[...slug-maybe-version].page/get-entity-type-base-url";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const isDraft = !!router.query.draft;
  const { loading: loadingNamespace, routeNamespace } = useRouteNamespace();

  const [slug, _, requestedVersionString] = router.query[
    "slug-maybe-version"
  ] as [string, "v" | undefined, `${number}` | undefined]; // @todo validate that the URL is formatted as expected;

  const entityTypeBaseUrl = !isDraft
    ? getEntityTypeBaseUrl(slug, router.query.shortname as `@${string}`)
    : undefined;

  const draftEntityType = useMemo(() => {
    if (router.query.draft) {
      const entityTypeSchema = JSON.parse(
        Buffer.from(
          decodeURIComponent(router.query.draft.toString()),
          "base64",
        ).toString("utf8"),
      );

      const validationResult = validateEntityType(entityTypeSchema);
      if (validationResult.type === "Ok") {
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
        throw Error(
          `Invalid draft entity type: ${JSON.stringify(validationResult)}`,
        );
      }
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
      throw new Error("Namespace for valid entity somehow missing");
    }
  }

  return (
    <EntityTypePage
      accountId={routeNamespace.accountId}
      draftEntityType={draftEntityType}
      entityTypeBaseUrl={entityTypeBaseUrl}
      requestedVersion={requestedVersion}
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
