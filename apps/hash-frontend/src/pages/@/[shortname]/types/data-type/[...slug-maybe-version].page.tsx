import { GlobalStyles } from "@mui/system";
import { useRouter } from "next/router";

import {
  parseOntologyTypeVersion,
  validateVersionedUrl,
} from "@blockprotocol/type-system";

import { generateLinkParameters } from "../../../../../shared/generate-link-parameters";
import { getLayoutWithSidebar } from "../../../../../shared/layout";
import { DataType } from "../../../../shared/data-type";
import { NotFound } from "../../../../shared/not-found";
import { useRouteNamespace } from "../../shared/use-route-namespace";
import { getTypeBaseUrl } from "../shared/get-type-base-url";

import type { NextPageWithLayout } from "../../../../../shared/layout";

const Page: NextPageWithLayout = () => {
  const router = useRouter();

  const { loading: loadingNamespace, routeNamespace } = useRouteNamespace();

  /**
   * router.query is not populated in this page, probably some combination of the rewrite @[shortname] routes and the fact this is a catch all.
   * We have to parse out the path ourselves.
   *
   * @see https://github.com/vercel/next.js/issues/50212 –– possibly related
   *
   * @example /@hash/types/data-type/integer/v/1
   * @example /@hash/types/data-type/integer
   */
  const [
    _,
    shortnameWithAt,
    _types,
    _dataType,
    slug,
    _v,
    requestedVersionString,
  ] = router.asPath.replace(/[?#].*$/, "").split("/") as [
    "",
    `@${string}`,
    "types",
    "data-type",
    string,
    "v" | undefined,
    `${number}` | undefined,
  ];

  const dataTypeBaseUrl = getTypeBaseUrl({
    slug,
    namespaceWithAt: shortnameWithAt,
    kind: "data-type",
  });

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

  if (!routeNamespace) {
    if (loadingNamespace) {
      return null;
    } else {
      throw new Error("Namespace for valid data type somehow missing");
    }
  }

  return (
    <>
      <DataType
        dataTypeBaseUrl={dataTypeBaseUrl}
        key={`${dataTypeBaseUrl}-${requestedVersion?.toString()}`}
        requestedVersion={requestedVersion}
        onDataTypeUpdated={(dataType) => {
          void router.push(generateLinkParameters(dataType.schema.$id).href);
        }}
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
