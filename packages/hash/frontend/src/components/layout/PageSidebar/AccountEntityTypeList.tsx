import { VFC, useState } from "react";
import { tw } from "twind";

import { TreeView, TreeItem } from "@mui/lab";
import { Typography, IconButton, Box, Collapse } from "@mui/material";
import {
  faAdd,
  faChevronDown,
  faChevronRight,
  faEllipsis,
  faSearch,
  faArrowUpAZ,
} from "@fortawesome/free-solid-svg-icons";
// import styles from "./PageSidebar.module.scss";
import { useAccountEntityTypes } from "../../hooks/useAccountEntityTypes";
import { FontAwesomeSvgIcon } from "../../icons";
import { NavLink } from "./NavLink";
import { Link } from "../../Link";
import { EntityTypeMenu } from "./EntityTypeMenu";

type AccountEntityTypeListProps = {
  accountId: string;
};

export const AccountEntityTypeList: VFC<AccountEntityTypeListProps> = ({
  accountId,
}) => {
  const { data } = useAccountEntityTypes(accountId);

  return (
    <Box>
      <NavLink title="Types" addButtonTooltip="Create new type">
        <Box component="ul">
          <Box
            component="li"
            sx={{
              display: "flex",
              alignItems: "center",
              mx: 0.5,
              pl: 3.75,
            }}
          >
            <Typography
              variant="smallTextLabels"
              fontWeight="600"
              sx={{ mr: "auto", color: ({ palette }) => palette.gray[80] }}
            >
              View All Types
            </Typography>
            <IconButton sx={{ mr: 1.25 }}>
              <FontAwesomeSvgIcon icon={faSearch} />
            </IconButton>
            <IconButton>
              <FontAwesomeSvgIcon icon={faArrowUpAZ} />
            </IconButton>
          </Box>
          {data?.getAccountEntityTypes.map((entityType) => {
            return (
              <Box
                component="li"
                sx={{
                  mx: 0.5,
                  pl: 3.75,
                  pr: "4px",
                  borderRadius: "4px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: ({ palette }) => palette.gray[70],

                  "& .entity-type-menu": {
                    visibility: "hidden",
                  },

                  "&:hover": {
                    backgroundColor: ({ palette }) => palette.gray[20],
                    color: ({ palette }) => palette.gray[80],

                    "& .entity-type-menu": {
                      visibility: "visible",
                    },
                  },

                  "&:focus": {
                    "& .entity-type-menu": {
                      visibility: "visible",
                    },
                  },
                }}
                key={entityType.entityId}
              >
                <Link
                  noLinkStyle
                  href={`/${accountId}/types/${entityType.entityId}`}
                  sx={{
                    py: "8px",
                    flex: 1,
                    color: "inherit",
                  }}
                >
                  <Typography
                    variant="smallTextLabels"
                    sx={{
                      color: "inherit",
                    }}
                  >
                    {entityType.properties.title}
                  </Typography>
                </Link>
                <EntityTypeMenu className="entity-type-menu" />
              </Box>
            );
          })}
        </Box>
      </NavLink>
    </Box>
  );

  // return (
  //     <Link href={`/${accountId}/types/new`}>
  //       <a className={tw`inline-block hover:border-transparent`}>
  //         <Button>Create Entity Type</Button>
  //       </a>
  //     </Link>
  //   </div>
  // );
};
