import type { BaseUrl } from "@blockprotocol/type-system";
import { parseOntologyTypeVersion } from "@blockprotocol/type-system";
import { useRouter } from "next/router";

import type { NextPageWithLayout } from "../../../../shared/layout";
import { getLayoutWithSidebar } from "../../../../shared/layout";
import { DataType } from "../../../shared/data-type";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const [base64EncodedBaseUrl, _, requestedVersionString] = router.query[
    "base64-baseurl-maybe-version"
  ] as [string, "v" | undefined, `${number}` | undefined]; // @todo validate that the URL is formatted as expected;

  const dataTypeBaseUrl = atob(base64EncodedBaseUrl) as BaseUrl;

  const requestedVersion = requestedVersionString
    ? parseOntologyTypeVersion(requestedVersionString)
    : null;

  return (
    <DataType
      dataTypeBaseUrl={dataTypeBaseUrl}
      isInSlide={false}
      key={`${dataTypeBaseUrl}-${requestedVersion?.toString()}`}
      requestedVersion={requestedVersion}
      onDataTypeUpdated={() => {
        throw new Error("Unexpected update to external data type");
      }}
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
