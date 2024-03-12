import { AsteriskRegularIcon } from "@hashintel/design-system";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getEntityTypeById } from "@local/hash-subgraph/stdlib";
import { Box, Typography } from "@mui/material";
import { FunctionComponent, useMemo } from "react";

import { PlusRegularIcon } from "../../../shared/icons/plus-regular";

export const DraftEntityType: FunctionComponent<{
  entity: Entity;
  subgraph: Subgraph<EntityRootType>;
}> = ({ entity, subgraph }) => {
  const entityType = useMemo(() => {
    const entityTypeInSubgraph = getEntityTypeById(
      subgraph,
      entity.metadata.entityTypeId,
    );

    if (!entityTypeInSubgraph) {
      throw new Error("Entity type not found in subgraph");
    }

    return entityTypeInSubgraph;
  }, [entity, subgraph]);

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
        <PlusRegularIcon sx={{ fontSize: 14, marginRight: 0.5 }} />
        <Typography
          sx={{
            color: ({ palette }) => palette.common.white,
            marginRight: 1,
            fontWeight: 500,
            fontSize: 12,
          }}
        >
          New
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
        <Typography sx={{ fontWeight: 500, fontSize: 12 }}>
          {entityType.metadata.icon ?? (
            <AsteriskRegularIcon
              sx={{
                fontSize: 12,
                color: ({ palette }) => palette.blue[70],
                position: "relative",
                top: 1,
              }}
            />
          )}{" "}
          {entityType.schema.title}
        </Typography>
      </Box>
    </Box>
  );
};
