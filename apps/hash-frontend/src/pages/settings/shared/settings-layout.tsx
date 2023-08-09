import { Box, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { PropsWithChildren, ReactElement, useMemo } from "react";

import { Org } from "../../../lib/user-and-org";
import { LayoutWithSidebar } from "../../../shared/layout/layout-with-sidebar";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { TopContextBar } from "../../shared/top-context-bar";
import {
  MenuItem,
  MenuItemWithChildren,
  SettingsSidebar,
} from "./settings-layout/settings-sidebar";

const generateMenuLinks = (
  organizations: Org[],
): {
  menuItemsFlat: MenuItem[];
  menuItemsWithChildren: MenuItemWithChildren[];
} => {
  const organizationItems: MenuItem[] = organizations
    .map((org) => [
      {
        label: org.name,
        href: `/settings/organizations/${org.shortname}`,
        parentHref: "/settings/organizations",
      },
      {
        label: "General",
        href: `/settings/organizations/${org.shortname}/general`,
        parentHref: `/settings/organizations/${org.shortname}`,
      },
      {
        label: "Members",
        href: `/settings/organizations/${org.shortname}/members`,
        parentHref: `/settings/organizations/${org.shortname}`,
      },
    ])
    .flat();

  const menuItemsFlat = [
    { label: "Personal info", href: "/settings/personal" },
    { label: "Organizations", href: "/settings/organizations" },
    ...organizationItems,
  ];

  const menuItemsWithChildren: MenuItemWithChildren[] = JSON.parse(
    JSON.stringify(menuItemsFlat),
  );
  for (const item of menuItemsWithChildren) {
    item.children = menuItemsWithChildren.filter(
      (child) => child.parentHref === item.href,
    );
  }

  return {
    menuItemsWithChildren,
    menuItemsFlat,
  };
};

const containerSx = { maxWidth: { lg: 1040 }, margin: "0 auto" };

const SettingsLayout = ({ children }: PropsWithChildren) => {
  const user = useAuthenticatedUser();

  const router = useRouter();

  const { menuItemsWithChildren, menuItemsFlat } = useMemo(() => {
    if (!user.authenticatedUser.accountSignupComplete) {
      return {
        menuItemsFlat: [],
        menuItemsWithChildren: [],
      };
    }

    return generateMenuLinks(user.authenticatedUser.memberOf);
  }, [user.authenticatedUser]);

  const breadcrumbs = useMemo(() => {
    const crumbs = [];

    if (router.asPath !== "settings") {
      let href: string | undefined = router.asPath;

      do {
        // eslint-disable-next-line no-loop-func
        const currentPage = menuItemsFlat.find((item) => item.href === href);

        if (!currentPage) {
          break;
        }

        crumbs.unshift({
          id: currentPage.href,
          href: currentPage.href,
          title: currentPage.label,
        });

        href = currentPage.parentHref;
      } while (href);
    }

    crumbs.unshift({
      id: "settings",
      title: "Settings",
      href: "/settings",
    });

    return crumbs;
  }, [menuItemsFlat, router.asPath]);

  if (!user.authenticatedUser.accountSignupComplete) {
    void router.push("/login");
    return null;
  }

  return (
    <LayoutWithSidebar fullWidth>
      <TopContextBar
        crumbs={breadcrumbs}
        defaultCrumbIcon={null}
        scrollToTop={() => {}}
      />
      <Box sx={{ background: "white", pl: 4, py: 3 }}>
        <Typography variant="h4" sx={containerSx}>
          Settings
        </Typography>
      </Box>
      <Container sx={containerSx}>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <SettingsSidebar menuItems={menuItemsWithChildren} />
          <Box sx={{ flex: 1 }}>{children}</Box>
        </Box>
      </Container>
    </LayoutWithSidebar>
  );
};

export const getSettingsLayout = (page: ReactElement) => {
  return <SettingsLayout>{page}</SettingsLayout>;
};
