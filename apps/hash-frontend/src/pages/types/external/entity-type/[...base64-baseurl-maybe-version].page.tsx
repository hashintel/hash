import { useRouter } from "next/router";

import {
  parseOntologyTypeVersion,
  validateVersionedUrl,
} from "@blockprotocol/type-system";

import { getLayoutWithSidebar } from "../../../../shared/layout";
import { EntityType } from "../../../shared/entity-type";
import { NotFound } from "../../../shared/not-found";

import type { NextPageWithLayout } from "../../../../shared/layout";
import type { BaseUrl } from "@blockprotocol/type-system";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const [base64EncodedBaseUrl, _, requestedVersionString] = router.query[
    "base64-baseurl-maybe-version"
  ] as [string, "v" | undefined, `${number}` | undefined]; // @todo validate that the URL is formatted as expected;

  const entityTypeBaseUrl = atob(base64EncodedBaseUrl) as BaseUrl;

  if (
    requestedVersionString &&
    validateVersionedUrl(`${entityTypeBaseUrl}v/${requestedVersionString}`)
      .type === "Err"
  ) {
    return <NotFound resourceLabel={{ label: "entity type" }} />;
  }

  const requestedVersion = requestedVersionString
    ? parseOntologyTypeVersion(requestedVersionString)
    : null;

  return (
    <EntityType
      entityTypeBaseUrl={entityTypeBaseUrl}
      isInSlide={false}
      key={`${entityTypeBaseUrl}-${requestedVersion?.toString()}`}
      requestedVersion={requestedVersion}
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
