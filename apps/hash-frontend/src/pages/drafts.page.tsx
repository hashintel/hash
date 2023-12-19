import { PenRegularIcon } from "@hashintel/design-system";
import {
  Box,
  breadcrumbsClasses,
  buttonClasses,
  inputBaseClasses,
  selectClasses,
  Typography,
} from "@mui/material";
import { NextSeo } from "next-seo";
import { useState } from "react";

import { BarsSortRegularIcon } from "../shared/icons/bars-sort-regular-icon";
import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { MenuItem } from "../shared/ui";
import { DraftEntities, SortOrder } from "./drafts.page/draft-entities";
import { InlineSelect } from "./shared/inline-select";
import { NotificationsWithLinksContextProvider } from "./shared/notifications-with-links-context";
import { TopContextBar } from "./shared/top-context-bar";

const sortOrderHumanReadable: Record<SortOrder, string> = {
  "created-at-asc": "creation date/time (oldest first)",
  "created-at-desc": "creation date/time (newest first)",
};

const DraftsPage: NextPageWithLayout = () => {
  const [sortOrder, setSortOrder] = useState<SortOrder>("created-at-desc");

  return (
    <NotificationsWithLinksContextProvider>
      <NextSeo title="Drafts" />
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Drafts",
            id: "drafts",
            icon: <PenRegularIcon />,
          },
        ]}
        sx={{
          background: "transparent",
          [`.${breadcrumbsClasses.ol} .${buttonClasses.root}`]: {
            background: "transparent",
            borderColor: "transparent",
          },
        }}
        breadcrumbsEndAdornment={
          <Box
            display="flex"
            alignItems="center"
            columnGap={1}
            sx={{
              "> div": {
                lineHeight: 0,
                [`.${selectClasses.select}.${inputBaseClasses.input}`]: {
                  fontSize: 14,
                  height: 14,
                },
              },
            }}
          >
            <Typography
              sx={{
                fontSize: 14,
                fontWeight: 500,
                color: ({ palette }) => palette.gray[70],
              }}
            >
              <BarsSortRegularIcon
                sx={{
                  fontSize: 14,
                  marginRight: 0.5,
                  position: "relative",
                  top: 2,
                }}
              />
              Sort by
            </Typography>
            <InlineSelect
              value={sortOrder}
              onChange={({ target }) => setSortOrder(target.value as SortOrder)}
            >
              {Object.entries(sortOrderHumanReadable).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </InlineSelect>
          </Box>
        }
      />
      <DraftEntities sortOrder={sortOrder} />
    </NotificationsWithLinksContextProvider>
  );
};

DraftsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default DraftsPage;
