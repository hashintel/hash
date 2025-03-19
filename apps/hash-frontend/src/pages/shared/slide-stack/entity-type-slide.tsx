import type { VersionedUrl } from "@blockprotocol/type-system";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import type { FunctionComponent } from "react";

import { EntityType } from "../entity-type";
import type { SlideItem } from "./types";

interface EntityTypeSlideProps {
  replaceItem: (item: SlideItem) => void;
  typeUrl: VersionedUrl;
}

export const EntityTypeSlide: FunctionComponent<EntityTypeSlideProps> = ({
  replaceItem,
  typeUrl,
}) => {
  const { baseUrl, version } = componentsFromVersionedUrl(typeUrl);

  return (
    <EntityType
      entityTypeBaseUrl={baseUrl}
      isInSlide
      requestedVersion={version}
      onEntityTypeUpdated={(entityType) =>
        replaceItem({
          itemId: entityType.schema.$id,
          kind: "entityType",
        })
      }
    />
  );
};
