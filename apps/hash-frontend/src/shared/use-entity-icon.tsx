import type { VersionedUrl } from "@blockprotocol/type-system";
import { AsteriskRegularIcon } from "@hashintel/design-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { Entity, EntityTypeWithMetadata } from "@local/hash-subgraph";
import { Box } from "@mui/material";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { FileRegularIcon } from "./icons/file-regular-icon";
import { UserIcon } from "./icons/user-icon";
import { UsersRegularIcon } from "./icons/users-regular-icon";

export const entityTypeIcons: Record<VersionedUrl, ReactNode> = {
  [systemEntityTypes.user.entityTypeId]: <UserIcon sx={{ fontSize: 12 }} />,
  [systemEntityTypes.organization.entityTypeId]: (
    <UsersRegularIcon sx={{ fontSize: 14, position: "relative", top: 1 }} />
  ),
  [systemEntityTypes.document.entityTypeId]: (
    <FileRegularIcon sx={{ fontSize: 12 }} />
  ),
  // @todo canvas icon
};

export const useEntityIcon = (params: {
  entity?: Entity;
  entityType?: EntityTypeWithMetadata;
  pageIcon?: JSX.Element;
}) => {
  const { entity, entityType, pageIcon } = params;
  return useMemo(() => {
    if (entity) {
      /**
       * @todo do we need this check for page? and the same below
       * we could let people set an icon on any entity and use it
       * if we do so we may wish to check if the icon is a URL, and show an image if it is
       * consider as part of H-783
       */
      if (isPageEntityTypeId(entity.metadata.entityTypeId)) {
        const { icon: customPageIcon } = simplifyProperties(
          entity.properties as PageProperties,
        );

        if (typeof customPageIcon === "string") {
          return (
            <Box component="span" sx={{ fontSize: 14 }}>
              {customPageIcon}
            </Box>
          );
        }
      }
      /**
       * @todo: use the entity type icon
       * @see https://linear.app/hash/issue/H-783/implement-entity-type-icons
       */
      return pageIcon &&
        // @todo when implementing H-783 – do we need this check? see comment above
        isPageEntityTypeId(entity.metadata.entityTypeId)
        ? pageIcon
        : entityTypeIcons[entity.metadata.entityTypeId] ??
            entityType?.metadata.icon ?? (
              <AsteriskRegularIcon sx={{ fontSize: 12 }} />
            );
    }
  }, [entity, entityType, pageIcon]);
};
