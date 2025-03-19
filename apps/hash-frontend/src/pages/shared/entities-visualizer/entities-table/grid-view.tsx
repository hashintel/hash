import type { EntityId } from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import { Grid } from "@mui/material";
import type { FunctionComponent } from "react";

import { GridViewItem } from "./grid-view/grid-view-item";
import { GridViewItemSkeleton } from "./grid-view/grid-view-item-skeleton";

export const GridView: FunctionComponent<{
  entities?: Entity[];
  onEntityClick: (entityId: EntityId) => void;
}> = ({ entities, onEntityClick }) => {
  return (
    <Grid
      container
      sx={{
        background: ({ palette }) => palette.common.white,
        borderColor: ({ palette }) => palette.gray[30],
        borderStyle: "solid",
        borderWidth: 1,
        borderTopWidth: 0,
        borderBottomRightRadius: "8px",
        borderBottomLeftRadius: "8px",
        overflow: "hidden",
      }}
    >
      {entities
        ? entities.map((entity, index, all) => (
            <GridViewItem
              key={entity.metadata.recordId.entityId}
              entity={entity}
              index={index}
              onEntityClick={onEntityClick}
              numberOfItems={all.length}
            />
          ))
        : Array.from({ length: 4 }, (_, index) => (
            <GridViewItemSkeleton key={index} numberOfItems={4} index={index} />
          ))}
    </Grid>
  );
};
