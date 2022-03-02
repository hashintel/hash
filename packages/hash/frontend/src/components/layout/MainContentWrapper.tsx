import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { IconButton, Fade, Box } from "@mui/material";
import { FunctionComponent } from "react";

import styles from "../../pages/index.module.scss";
import { FontAwesomeSvgIcon } from "../icons";
import { PageSidebar } from "./PageSidebar/PageSidebar";
import { useSidebarContext } from "./SidebarContext";

export const MainContentWrapper: FunctionComponent = ({ children }) => {
  const { openSidebar, sidebarOpen } = useSidebarContext();

  return (
    <Box
      sx={{
        display: "flex",
        position: "relative",
      }}
    >
      <PageSidebar />
      <Fade in={!sidebarOpen}>
        <IconButton
          sx={{
            height: 36,
            width: 36,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            top: 32,
            left: 32,
          }}
          onClick={openSidebar}
        >
          <FontAwesomeSvgIcon icon={faPencil} sx={{ fontSize: 24 }} />
        </IconButton>
      </Fade>
      <Box component="main" sx={{ flex: 1, padding: "60px 120px" }}>
        {children}
      </Box>
    </Box>
  );
};
