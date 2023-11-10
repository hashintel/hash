import { AsteriskRegularIcon } from "@hashintel/design-system";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { isPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import { Entity } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box } from "@mui/material";
import { useMemo } from "react";

import { FileRegularIcon } from "./icons/file-regular-icon";
import { UserIcon } from "./icons/user-icon";
import { UsersRegularIcon } from "./icons/users-regular-icon";

export const entityTypeIcons = {
  [systemTypes.entityType.user.entityTypeId]: (
    <UserIcon sx={{ fontSize: 12 }} />
  ),
  [systemTypes.entityType.org.entityTypeId]: (
    <UsersRegularIcon sx={{ fontSize: 14, position: "relative", top: 1 }} />
  ),
  [systemTypes.entityType.document.entityTypeId]: (
    <FileRegularIcon sx={{ fontSize: 12 }} />
  ),
  // @todo canvas icon
} as const;

export const useEntityIcon = (params: {
  entity?: Entity;
  pageIcon?: JSX.Element;
}) => {
  const { entity, pageIcon } = params;
  return useMemo(() => {
    if (entity) {
      /**
       * @todo do we need this check for page? and the same below
       * we could let people set an icon on any entity and use it
       * if we do so we may wish to check if the icon is a URL, and show an image if it is
       * consider as part of H-783
       */
      if (isPageEntityTypeId(entity.metadata.entityTypeId)) {
        const customPageIcon =
          entity.properties[
            extractBaseUrl(systemTypes.propertyType.icon.propertyTypeId)
          ];
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
        : entityTypeIcons[entity.metadata.entityTypeId] ?? (
            <AsteriskRegularIcon sx={{ fontSize: 12 }} />
          );
    }
  }, [entity, pageIcon]);
};
