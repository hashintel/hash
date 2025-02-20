import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import { Box } from "@mui/material";
import type { FunctionComponent } from "react";

import { EntityType } from "../entity-type";

interface EntityTypeSlideProps {
  typeUrl: VersionedUrl;
}

export const EntityTypeSlide: FunctionComponent<EntityTypeSlideProps> = ({
  typeUrl,
}) => {
  const { baseUrl, version } = componentsFromVersionedUrl(typeUrl);

  return (
    <EntityType
      entityTypeBaseUrl={baseUrl}
      inSlide
      requestedVersion={version}
    />
  );
};
