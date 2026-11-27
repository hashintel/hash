import { useRouter } from "next/router";

import {
  parseOntologyTypeVersion,
  validateVersionedUrl,
} from "@blockprotocol/type-system";

import { generateLinkParameters } from "../../../../shared/generate-link-parameters";
import { getLayoutWithSidebar } from "../../../../shared/layout";
import { DataType } from "../../../shared/data-type";
import { NotFound } from "../../../shared/not-found";

import type { NextPageWithLayout } from "../../../../shared/layout";
import type { BaseUrl } from "@blockprotocol/type-system";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const [base64EncodedBaseUrl, _, requestedVersionString] = router.query[
    "base64-baseurl-maybe-version"
  ] as [string, "v" | undefined, `${number}` | undefined]; // @todo validate that the URL is formatted as expected;

  const dataTypeBaseUrl = atob(base64EncodedBaseUrl) as BaseUrl;

  if (
    requestedVersionString &&
    validateVersionedUrl(`${dataTypeBaseUrl}v/${requestedVersionString}`)
      .type === "Err"
  ) {
    return <NotFound resourceLabel={{ label: "data type" }} />;
  }

  const requestedVersion = requestedVersionString
    ? parseOntologyTypeVersion(requestedVersionString)
    : null;

  return (
    <DataType
      dataTypeBaseUrl={dataTypeBaseUrl}
      key={`${dataTypeBaseUrl}-${requestedVersion?.toString()}`}
      requestedVersion={requestedVersion}
      // External types render read-only, so no save arrives here — only the
      // version menu, which re-opens the page on the picked edition
      onDataTypeUpdated={(dataType) => {
        void router.push(generateLinkParameters(dataType.schema.$id).href);
      }}
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
