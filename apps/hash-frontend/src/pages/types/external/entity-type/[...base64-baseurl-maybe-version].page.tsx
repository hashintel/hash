import type { BaseUrl } from "@local/hash-subgraph";
import { useRouter } from "next/router";

import type { NextPageWithLayout } from "../../../../shared/layout";
import { getLayoutWithSidebar } from "../../../../shared/layout";
import { EntityTypePage } from "../../../shared/entity-type-page";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const [base64EncodedBaseUrl, _, requestedVersionString] = router.query[
    "base64-baseurl-maybe-version"
  ] as [string, "v" | undefined, `${number}` | undefined]; // @todo validate that the URL is formatted as expected;

  const entityTypeBaseUrl = atob(base64EncodedBaseUrl) as BaseUrl;

  const requestedVersion = requestedVersionString
    ? parseInt(requestedVersionString, 10)
    : null;

  return (
    <EntityTypePage
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
