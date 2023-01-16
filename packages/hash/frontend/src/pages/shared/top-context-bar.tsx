import { faFile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@local/design-system";
import { Box } from "@mui/material";
import { ReactNode } from "react";

import { useSidebarContext } from "../../shared/layout/layout-with-sidebar";
import { Breadcrumbs, BreadcrumbsProps } from "./breadcrumbs";

type Props = {
  crumbs: BreadcrumbsProps["crumbs"];
  defaultCrumbIcon?: ReactNode;
  scrollToTop: () => void;
};

export const TOP_CONTEXT_BAR_HEIGHT = 50;

export const TopContextBar = ({
  crumbs,
  defaultCrumbIcon = <FontAwesomeIcon icon={faFile} />,
  scrollToTop = () => {},
}: Props) => {
  const { sidebarOpen } = useSidebarContext();
  return (
    <Box
      display="flex"
      alignItems="center"
      height={TOP_CONTEXT_BAR_HEIGHT}
      pl={sidebarOpen ? 3 : 8}
      pr={4}
    >
      <Box>
        <Breadcrumbs
          crumbs={crumbs}
          defaultIcon={defaultCrumbIcon}
          scrollToTop={scrollToTop}
        />
      </Box>
    </Box>
  );
};
