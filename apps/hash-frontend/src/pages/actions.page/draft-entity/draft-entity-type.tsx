import { extractBaseUrl } from "@blockprotocol/type-system";
import { ArrowUpRegularIcon, EntityOrTypeIcon } from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent } from "react";

import { PlusRegularIcon } from "../../../shared/icons/plus-regular";
import type { EntityTypeDisplayInfoByBaseUrl } from "../draft-entities/types";

const iconSx = { fontSize: 14, marginRight: 0.5 };

export const DraftEntityType: FunctionComponent<{
  entity: HashEntity;
  entityTypeDisplayInfoByBaseUrl: EntityTypeDisplayInfoByBaseUrl;
}> = ({ entity, entityTypeDisplayInfoByBaseUrl }) => {
  const entityType =
    entityTypeDisplayInfoByBaseUrl[
      extractBaseUrl(entity.metadata.entityTypeIds[0])
    ];

  if (!entityType) {
    throw new Error(
      `Entity type for ${entity.metadata.entityTypeIds[0]} not found in entityTypeDisplayInfoByBaseUrl`,
    );
  }

  const isUpdate =
    !!entity.metadata.provenance.firstNonDraftCreatedAtDecisionTime;

  return (
    <Box display="flex" alignItems="stretch" flexShrink={0}>
      <Box
        sx={{
          borderTopLeftRadius: 13,
          borderBottomLeftRadius: 13,
          height: 26,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          background: ({ palette }) => palette.blue[70],
          color: ({ palette }) => palette.common.white,
          paddingX: 1.25,
        }}
      >
        {isUpdate ? (
          <ArrowUpRegularIcon sx={iconSx} />
        ) : (
          <PlusRegularIcon sx={iconSx} />
        )}
        <Typography
          sx={{
            color: ({ palette }) => palette.common.white,
            marginRight: 1,
            fontWeight: 500,
            fontSize: 12,
          }}
        >
          {isUpdate ? "Updated" : "New"}
        </Typography>
      </Box>
      <Box
        sx={{
          marginLeft: "-13px",
          borderRadius: 13,
          background: ({ palette }) => palette.common.white,
          color: ({ palette }) => palette.common.black,
          paddingX: 1.25,
          borderWidth: 1,
          borderColor: ({ palette }) => palette.gray[30],
          borderStyle: "solid",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Typography
          component="div"
          sx={{
            fontWeight: 500,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
          }}
        >
          <EntityOrTypeIcon
            entity={null}
            fill={({ palette }) => palette.gray[50]}
            fontSize={12}
            icon={entityType.icon}
            isLink={entityType.isLink}
            sx={{ mr: 0.5 }}
          />
          {entityType.title}
        </Typography>
      </Box>
    </Box>
  );
};
