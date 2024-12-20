import { ArrowUpRegularIcon, EntityOrTypeIcon } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import { getEntityTypeById } from "@local/hash-subgraph/stdlib";
import { Box, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo } from "react";

import { PlusRegularIcon } from "../../../shared/icons/plus-regular";

const iconSx = { fontSize: 14, marginRight: 0.5 };

export const DraftEntityType: FunctionComponent<{
  entity: Entity;
  subgraph: Subgraph<EntityRootType>;
}> = ({ entity, subgraph }) => {
  const entityType = useMemo(() => {
    const entityTypeInSubgraph = getEntityTypeById(
      subgraph,
      entity.metadata.entityTypeIds[0],
    );

    if (!entityTypeInSubgraph) {
      throw new Error("Entity type not found in subgraph");
    }

    return entityTypeInSubgraph;
  }, [entity, subgraph]);

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
            icon={entityType.schema.icon}
            isLink={
              /**
               * @todo H-3363 use closed schema to take account of indirectly inherited link status
               */
              !!entityType.schema.allOf?.some(
                (allOf) => allOf.$ref === linkEntityTypeUrl,
              )
            }
            sx={{ mr: 0.5 }}
          />
          {entityType.schema.title}
        </Typography>
      </Box>
    </Box>
  );
};
