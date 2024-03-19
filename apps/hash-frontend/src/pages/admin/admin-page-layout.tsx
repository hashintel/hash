import { faPerson } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@hashintel/design-system";
import { Box, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import {
  type PropsWithChildren,
  type ReactElement,
  useEffect,
  useMemo,
} from "react";

import { LayoutWithSidebar } from "../../shared/layout/layout-with-sidebar";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import type { SidebarItemData } from "../shared/settings-layout/settings-sidebar";
import { SettingsSidebar } from "../shared/settings-layout/settings-sidebar";
import { TopContextBar } from "../shared/top-context-bar";

const containerSx = {
  maxWidth: { lg: 1040 },
  margin: "0 auto",
  px: { xs: 4 },
};

const menuItems: SidebarItemData[] = [
  {
    label: "Users",
    activeIfPathStartsWith: "/admin/users/",
    pageTitle: "Manage users",
    href: "/admin/users",
    icon: <FontAwesomeIcon icon={faPerson} />,
  },
];

const AdminLayout = ({ children }: PropsWithChildren) => {
  const router = useRouter();

  const currentMenuItem = useMemo(
    () =>
      menuItems.find(
        (item) =>
          item.href === router.asPath ||
          (item.activeIfPathStartsWith &&
            router.asPath.startsWith(item.activeIfPathStartsWith)),
      ),
    [router],
  );

  const { isInstanceAdmin } = useAuthenticatedUser();

  useEffect(() => {
    /**
     * Redirect non instance admins away from `/admin` pages
     */
    if (typeof isInstanceAdmin === "boolean" && !isInstanceAdmin) {
      void router.push("/");
    }
  }, [router, isInstanceAdmin]);

  if (!isInstanceAdmin) {
    return null;
  }

  return (
    <LayoutWithSidebar fullWidth>
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Instance Administration",
            id: "instance-administration",
          },
          currentMenuItem
            ? { title: currentMenuItem.label, id: currentMenuItem.href }
            : [],
        ].flat()}
      />
      <Box sx={({ palette }) => ({ background: palette.common.white, py: 3 })}>
        <Typography variant="h4" sx={{ ...containerSx }}>
          {currentMenuItem
            ? currentMenuItem.pageTitle ?? currentMenuItem.label
            : "Instance Administration"}
        </Typography>
      </Box>
      <Container sx={{ ...containerSx, py: 6 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <SettingsSidebar heading="Instance" menuItems={menuItems} />
          <Box sx={{ flex: 1 }}>{children}</Box>
        </Box>
      </Container>
    </LayoutWithSidebar>
  );
};

export const getAdminLayout = (page: ReactElement) => {
  return <AdminLayout>{page}</AdminLayout>;
};
