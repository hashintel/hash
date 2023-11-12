import { validateEntityType } from "@blockprotocol/type-system";
import { EntityType } from "@blockprotocol/type-system/slim";
import { OwnedById } from "@local/hash-subgraph";
// eslint-disable-next-line unicorn/prefer-node-protocol -- https://github.com/sindresorhus/eslint-plugin-unicorn/issues/1931#issuecomment-1359324528
import { Buffer } from "buffer/";
import { useRouter } from "next/router";
import { useMemo } from "react";

import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../../shared/layout";
import { useIsReadonlyModeForType } from "../../../../shared/readonly-mode";
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
      const entityType = JSON.parse(
        Buffer.from(
          decodeURIComponent(router.query.draft.toString()),
          "base64",
        ).toString("utf8"),
      );

      const validationResult = validateEntityType(entityType);
      if (validationResult.type === "Ok") {
        return entityType as EntityType;
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

  const userUnauthorized = useIsReadonlyModeForType(
    routeNamespace?.accountId as OwnedById,
  );

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
      readonly={userUnauthorized}
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
