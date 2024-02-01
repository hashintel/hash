import { Entity } from "@local/hash-subgraph";
import { Grid } from "@mui/material";
import { FunctionComponent } from "react";

import { GridViewItem } from "./grid-view/grid-view-item";

export const GridView: FunctionComponent<{ entities?: Entity[] }> = ({
  entities,
}) => {
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
      {entities ? (
        entities.map((entity, index, all) => (
          <GridViewItem
            key={entity.metadata.recordId.entityId}
            entity={entity}
            numberOfItems={all.length}
            index={index}
          />
        ))
      ) : (
        <>skeleton</>
      )}
    </Grid>
  );
};
