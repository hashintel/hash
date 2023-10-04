import { Box, Divider, Typography } from "@mui/material";
import { Fragment, FunctionComponent } from "react";

import { generateEntityLabel } from "../../lib/entities";
import { ProfilePageTab } from "./util";

export const PinnedEntityTypeTabContents: FunctionComponent<
  Extract<ProfilePageTab, { kind: "pinned-entity-type" }>
> = ({ entities, entitiesSubgraph }) => {
  return (
    <Box>
      <Box display="flex">
        <Typography
          variant="smallCaps"
          sx={{ color: ({ palette }) => palette.gray[70] }}
        >
          Pages
        </Typography>
        <Typography variant="smallTextLabels">Sort by</Typography>
      </Box>
      <Box
        sx={{
          borderRadius: "4px",
          borderColor: ({ palette }) => palette.gray[30],
          borderStyle: "solid",
          borderWidth: 1,
          background: ({ palette }) => palette.common.white,
          boxShadow: "0px 1px 5px 0px rgba(27, 33, 40, 0.07)",
        }}
      >
        {entitiesSubgraph
          ? entities?.map((entity, index, all) => {
              const label = generateEntityLabel(entitiesSubgraph, entity);
              return (
                <Fragment key={entity.metadata.recordId.entityId}>
                  <Box sx={{ padding: 3 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                      {label}
                    </Typography>
                  </Box>
                  {index < all.length - 1 ? <Divider /> : null}
                </Fragment>
              );
            })
          : null}
      </Box>
    </Box>
  );
};
