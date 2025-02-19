import type { VersionedUrl } from "@blockprotocol/type-system";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import { Box } from "@mui/system";
import type { FunctionComponent } from "react";

import { DataType } from "../data-type";
import type { CommonSlideProps, PushToStackFn } from "./types";

type DataTypeSlideProps = CommonSlideProps & {
  dataTypeId: VersionedUrl;
  pushToStack: PushToStackFn;
};

export const DataTypeSlide: FunctionComponent<DataTypeSlideProps> = ({
  dataTypeId,
  isReadOnly,
  pushToStack,
}) => {
  const { baseUrl, version } = componentsFromVersionedUrl(dataTypeId);

  return (
    <Box px={6} pb={5}>
      <DataType
        inSlide
        isReadOnly={isReadOnly}
        dataTypeBaseUrl={baseUrl}
        requestedVersion={version}
        onDataTypeClick={(newDataTypeId) => {
          pushToStack({
            type: "dataType",
            itemId: newDataTypeId,
          });
        }}
      />
    </Box>
  );
};
