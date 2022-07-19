import { BlockComponent, useGraphBlockService } from "@blockprotocol/graph";
import React, { useCallback, useRef, useState, useReducer } from "react";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { reducer, ActionType } from "./store";
import { Button, TextField } from "@mui/material";
import { Item } from "./item";
import { Motion, spring } from "react-motion";
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

type Item = {
  id: number;
  pos: number;
  value: string;
};

export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    blockEntity: { entityId, properties },
  },
}) => {
  const [list, dispatch] = useReducer(reducer, []);

  console.log(list);

  return (
    <Box sx={{ width: "100%", maxWidth: 360, bgcolor: "background.paper" }}>
      <DndProvider backend={HTML5Backend}>
        <nav aria-label="main mailbox folders">
          <List sx={{ position: "relative", height: "1000px" }}>
            {list.map((item, index) => (
              <Motion
                key={item.id}
                style={{
                  y: spring(item.pos * 60, { stiffness: 500, damping: 32 }),
                }}
              >
                {({ y }) => (
                  <ListItem
                    disablePadding
                    sx={{
                      position: "absolute",
                      top: 0,
                      transform: `translateY(${y}px)`,
                    }}
                  >
                    <Item
                      id={item.id}
                      index={index}
                      value={item.value}
                      onValueChange={(value: string) =>
                        dispatch({
                          type: ActionType.UPDATE_ITEM,
                          payload: {
                            sourceId: item.id,
                            value,
                          },
                        })
                      }
                      onReorder={(targetId: number) =>
                        dispatch({
                          type: ActionType.REORDER,
                          payload: {
                            sourceId: item.id,
                            targetId,
                          },
                        })
                      }
                    />
                  </ListItem>
                )}
              </Motion>
            ))}
          </List>
        </nav>
        <Button onClick={() => dispatch({ type: ActionType.ADD })}>Add</Button>
      </DndProvider>
    </Box>
  );
};
