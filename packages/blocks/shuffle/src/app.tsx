import { BlockComponent, useGraphBlockService } from "@blockprotocol/graph";
import * as React from "react";
import { useCallback, useRef } from "react";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
// import ListItemButton from '@mui/material/ListItemButton'
// import ListItemIcon from '@mui/material/ListItemIcon'
// import ListItemText from '@mui/material/ListItemText'
// import Divider from '@mui/material/Divider';
// import InboxIcon from '@mui/icons-material/Inbox';
// import DraftsIcon from '@mui/icons-material/Drafts';

// import styles from "./base.module.scss";

type BlockEntityProperties = {
  name: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: { entityId, properties },
  },
}) => {
  // const blockRootRef = useRef<HTMLDivElement>(null);
  // const { graphService } = useGraphBlockService(blockRootRef);

  // const updateSelf = useCallback(
  //   (newProperties: Partial<BlockEntityProperties>) =>
  //     graphService?.updateEntity({
  //       data: { properties: newProperties, entityId },
  //     }),
  //   [entityId, graphService],
  // );

  // const { name } = properties;

  return (
    <Box sx={{ width: "100%", maxWidth: 360, bgcolor: "background.paper" }}>
      test
      <nav aria-label="main mailbox folders">
        <List>
          <ListItem disablePadding>Item 1</ListItem>
          <ListItem disablePadding>Item 2</ListItem>
        </List>
      </nav>
    </Box>
  );
};
