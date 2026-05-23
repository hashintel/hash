import { componentsFromVersionedUrl, type VersionedUrl } from "@blockprotocol/type-system";

import { EntityType } from "../entity-type";

import type { SlideItem } from "./types";
import type { FunctionComponent } from "react";

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
