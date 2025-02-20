import type { VersionedUrl } from "@blockprotocol/type-system";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import { type FunctionComponent } from "react";

import { DataType } from "../data-type";

type DataTypeSlideProps = {
  dataTypeId: VersionedUrl;
};

export const DataTypeSlide: FunctionComponent<DataTypeSlideProps> = ({
  dataTypeId,
}) => {
  const { baseUrl, version } = componentsFromVersionedUrl(dataTypeId);

  return (
    <DataType inSlide dataTypeBaseUrl={baseUrl} requestedVersion={version} />
  );
};
