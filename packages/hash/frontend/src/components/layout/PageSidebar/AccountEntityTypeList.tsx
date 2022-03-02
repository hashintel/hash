import { VFC, useState } from "react";
import Link from "next/link";
import { tw } from "twind";

import { TreeView, TreeItem } from "@mui/lab";
import { Typography, IconButton, Box, Collapse } from "@mui/material";
import {
  faAdd,
  faChevronDown,
  faChevronRight,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
// import styles from "./PageSidebar.module.scss";
import { useAccountEntityTypes } from "../../hooks/useAccountEntityTypes";
import { FontAwesomeSvgIcon } from "../../icons";

type AccountEntityTypeListProps = {
  accountId: string;
};

export const AccountEntityTypeList: VFC<AccountEntityTypeListProps> = ({
  accountId,
}) => {
  const [visible, setVisible] = useState(false);
  const { data } = useAccountEntityTypes(accountId);

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          padding: "9px 18px",
          mx: 0.5,
          "&:hover": {
            backgroundColor: ({ palette }) => palette.gray[20],
          },
        }}
      >
        <Typography
          variant="smallCaps"
          sx={{
            mr: 1.4,
            color: ({ palette }) => palette.gray[50],
          }}
        >
          Types
        </Typography>
        <IconButton
          sx={{
            mr: "auto",
          }}
          onClick={() => setVisible((prev) => !prev)}
        >
          <FontAwesomeSvgIcon
            sx={{
              color: ({ palette }) => palette.gray[40],
              fontSize: 12,
              transform: visible ? `rotate(90deg)` : "none",
            }}
            icon={faChevronRight}
          />
        </IconButton>

        <IconButton>
          <FontAwesomeSvgIcon
            icon={faAdd}
            sx={{ fontSize: 12, color: ({ palette }) => palette.gray[40] }}
          />
        </IconButton>
      </Box>

      <Collapse in={visible}>
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
              <FontAwesomeSvgIcon icon={faSearch} />
            </IconButton>
          </Box>
          {data?.getAccountEntityTypes.map((entityType) => {
            return (
              <Box
                component="li"
                sx={{
                  mx: 0.5,
                  pl: 3.75,
                  "&:hover": {
                    backgroundColor: ({ palette }) => palette.gray[20],
                  },
                }}
                key={entityType.entityId}
              >
                <Link href={`/${accountId}/types/${entityType.entityId}`}>
                  <Typography
                    variant="smallTextLabels"
                    sx={{
                      color: ({ palette }) => palette.gray[50],
                    }}
                  >
                    {entityType.properties.title}
                  </Typography>
                </Link>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );

  // return (
  //   <div className={styles.SidebarList}>
  //     {data?.getAccountEntityTypes.map((entityType) => {
  //       return (
  //         <div key={entityType.entityId}>
  //           <Link href={`/${accountId}/types/${entityType.entityId}`}>
  //             <a>{entityType.properties.title}</a>
  //           </Link>
  //         </div>
  //       );
  //     })}
  //     <Link href={`/${accountId}/types/new`}>
  //       <a className={tw`inline-block hover:border-transparent`}>
  //         <Button>Create Entity Type</Button>
  //       </a>
  //     </Link>
  //   </div>
  // );
};
