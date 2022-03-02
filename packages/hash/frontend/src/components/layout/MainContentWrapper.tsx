import { faPencil } from "@fortawesome/free-solid-svg-icons";
import { IconButton, Fade } from "@mui/material";
import { FunctionComponent } from "react";

import styles from "../../pages/index.module.scss";
import { FontAwesomeSvgIcon } from "../icons";
import { PageSidebar } from "./PageSidebar/PageSidebar";
import { useSidebarContext } from "./SidebarContext";

export const MainContentWrapper: FunctionComponent = ({ children }) => {
  const { openSidebar, sidebarOpen } = useSidebarContext();

  return (
    <div className={styles.MainWrapper}>
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

      <main className={styles.MainContent}>{children}</main>
    </div>
  );
};
