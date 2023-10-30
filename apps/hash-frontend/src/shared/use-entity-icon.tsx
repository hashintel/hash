import { AsteriskRegularIcon } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { Entity } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box } from "@mui/material";
import { useMemo } from "react";

import { FileRegularIcon } from "./icons/file-regular-icon";
import { UserIcon } from "./icons/user-icon";
import { UsersRegularIcon } from "./icons/users-regular-icon";

export const entityTypeIcons = {
  [types.entityType.user.entityTypeId]: <UserIcon sx={{ fontSize: 12 }} />,
  [types.entityType.org.entityTypeId]: (
    <UsersRegularIcon sx={{ fontSize: 14, position: "relative", top: 1 }} />
  ),
  [types.entityType.page.entityTypeId]: (
    <FileRegularIcon sx={{ fontSize: 12 }} />
  ),
} as const;

export const useEntityIcon = (params: {
  entity?: Entity;
  pageIcon?: JSX.Element;
}) => {
  const { entity, pageIcon } = params;
  return useMemo(() => {
    if (entity) {
      if (entity.metadata.entityTypeId === types.entityType.page.entityTypeId) {
        const customPageIcon =
          entity.properties[
            extractBaseUrl(types.propertyType.icon.propertyTypeId)
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
        entity.metadata.entityTypeId === types.entityType.page.entityTypeId
        ? pageIcon
        : entityTypeIcons[entity.metadata.entityTypeId] ?? (
            <AsteriskRegularIcon sx={{ fontSize: 12 }} />
          );
    }
  }, [entity, pageIcon]);
};
