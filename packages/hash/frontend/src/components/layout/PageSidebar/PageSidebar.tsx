import { VoidFunctionComponent } from "react";

import { useRouter } from "next/router";
import { Box, Drawer, Typography, IconButton } from "@mui/material";
import { AccountSelect } from "./AccountSelect";
import { AccountPageList } from "./AccountPageList";

import styles from "./PageSidebar.module.scss";
import { AccountEntityTypeList } from "./AccountEntityTypeList";
import { FontAwesomeSvgIcon } from "../../icons";
import {
  faAdd,
  faChevronRight,
  faHistory,
  faHome,
  faLifeRing,
  faPencil,
  faZap,
} from "@fortawesome/free-solid-svg-icons";
import { NavLink } from "./NavLink";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { useSidebarContext } from "../SidebarContext";

export const SIDEBAR_WIDTH = 260;

export const PageSidebar: VoidFunctionComponent = () => {
  const router = useRouter();
  const { sidebarOpen, closeSidebar } = useSidebarContext();
  const { accountId, pageEntityId } = router.query as Record<string, string>;

  console.log("sidebarOpen ==> ", sidebarOpen);

  const goToAccount = (id: string) => router.push(`/${id}`);

  return (
    <Drawer variant="persistent" open={sidebarOpen}>
      <Box
        sx={{
          mx: 0.5,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Box sx={{ flex: 1, overflowX: "hidden" }}>
          <WorkspaceSwitcher />
        </Box>
        <IconButton
          sx={{
            height: 36,
            width: 36,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
          onClick={closeSidebar}
        >
          <FontAwesomeSvgIcon icon={faPencil} sx={{ fontSize: 24 }} />
        </IconButton>
      </Box>
      <NavLink icon={faHome} title="Home" to="/" />
      <NavLink icon={faZap} title="Quick Capture" to="/" />
      <NavLink icon={faHistory} title="Recently visited" to="/" />
      <Box sx={{ mb: 1.5 }} />

      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        {/* PAGES */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            padding: "9px 18px",
            mx: 0.5,
          }}
        >
          <Typography
            variant="smallCaps"
            sx={{
              mr: 1.4,
              color: ({ palette }) => palette.gray[50],
            }}
          >
            Pages
          </Typography>
          <FontAwesomeSvgIcon
            sx={{
              mr: "auto",
              color: ({ palette }) => palette.gray[40],
              fontSize: 12,
            }}
            icon={faChevronRight}
          />
          <IconButton>
            <FontAwesomeSvgIcon
              icon={faAdd}
              sx={{ fontSize: 12, color: ({ palette }) => palette.gray[40] }}
            />
          </IconButton>
        </Box>
        {/* TYPES */}
        <AccountEntityTypeList accountId={accountId} />

        {/* <header className={styles.PageSidebar__Section__Header}>
          <h2>Pages</h2>
          <AccountPageList
            currentPageEntityId={pageEntityId}
            accountId={accountId}
          />
        </header> */}

        <header className={styles.PageSidebar__Section__Header}>
          <h2>Account</h2>
          <AccountSelect onChange={goToAccount} value={accountId} />
        </header>
      </Box>

      {/* @todo replace with button implementation */}
      <Box
        sx={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 2,
          padding: "18px 22px",
          backgroundColor: ({ palette }) => palette.gray[10],
          borderTop: ({ palette }) => `1px solid ${palette.gray[30]}`,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",

          "&:hover": {
            backgroundColor: ({ palette }) => palette.gray[20],
          },
        }}
      >
        <FontAwesomeSvgIcon
          sx={{ mr: 1.5, color: ({ palette }) => palette.gray[50] }}
          color="inherit"
          icon={faLifeRing}
        />
        <Typography
          variant="smallTextLabels"
          sx={{ color: ({ palette }) => palette.gray[70] }}
        >
          Help and Support
        </Typography>
      </Box>
    </Drawer>
    // <nav className={styles.PageSidebar} style={{ width: SIDEBAR_WIDTH }}>
    //   <div className={styles.PageSidebar__Section}>
    //     <header className={styles.PageSidebar__Section__Header}>
    //       <h2>Account</h2>
    //       <AccountSelect onChange={goToAccount} value={accountId} />
    //     </header>
    //   </div>
    //   <div className={styles.PageSidebar__Section}>
    //     <header className={styles.PageSidebar__Section__Header}>
    //       <h2>Pages</h2>
    //       <AccountPageList
    //         currentPageEntityId={pageEntityId}
    //         accountId={accountId}
    //       />
    //     </header>
    //   </div>
    //   <div className={styles.PageSidebar__Section}>
    //     <header className={styles.PageSidebar__Section__Header}>
    //       <h2>Entities</h2>
    //       <AccountEntityTypeList accountId={accountId} />
    //     </header>
    //   </div>
    // </nav>
  );
};
