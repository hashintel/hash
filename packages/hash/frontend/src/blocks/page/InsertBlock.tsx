import { FunctionComponent, useState } from "react";
import { Box } from "@mui/material";
import { Menu } from "@hashintel/hash-design-system/menu";
import { PlusBoxOutlineIcon } from "../../shared/icons/plus-box-outline-icon";

type InsertBlockProps = {};

export const InsertBlock: FunctionComponent<InsertBlockProps> = () => {
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  return (
    <>
      <Box
        onClick={(event) => {
          setContextMenu(
            contextMenu === null
              ? {
                  mouseX: event.clientX + 2,
                  mouseY: event.clientY - 6,
                }
              : null,
          );
        }}
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: 0,
          height: 30,
          cursor: "pointer",
          transition: ({ transitions }) => transitions.create("opacity"),
          "&:hover": {
            opacity: 1,
          },
        }}
      >
        <Box
          sx={{
            width: 1,
            height: "1px",
            background:
              "linear-gradient(90deg, #DDE7F0 41.42%, #FFFFFF 50.26%, #DDE7F0 59.11%)",
          }}
        />
        <PlusBoxOutlineIcon sx={{ position: "absolute" }} />
      </Box>

      <Menu
        open={contextMenu !== null}
        onClose={() => setContextMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        test
      </Menu>
    </>
  );
};
