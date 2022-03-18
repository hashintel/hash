import { useMemo, VFC } from "react";

import { Typography, Box } from "@mui/material";
// import { faSearch, faArrowUpAZ } from "@fortawesome/free-solid-svg-icons";
// import { orderBy } from "lodash";
import { useRouter } from "next/router";
import { useAccountEntityTypes } from "../../../hooks/useAccountEntityTypes";
// import { FontAwesomeIcon } from "../../../icons";
import { NavLink } from "../NavLink";
import { Link } from "../../../Link";
import { EntityTypeMenu } from "./EntityTypeMenu";

type AccountEntityTypeListProps = {
  accountId: string;
};

export const AccountEntityTypeList: VFC<AccountEntityTypeListProps> = ({
  accountId,
}) => {
  const { data } = useAccountEntityTypes(accountId);
  const router = useRouter();
  //   const [order, setOrder] = useState<"asc" | "desc" | undefined>();

  const sortedData = useMemo(() => {
    return data?.getAccountEntityTypes ?? [];
  }, [data]);

  //   const sortedData = useMemo(() => {
  //     if (!order) {
  //       return data?.getAccountEntityTypes ?? [];
  //     }

  //     return orderBy(
  //       data?.getAccountEntityTypes ?? [],
  //       ["properties.title"],
  //       [order],
  //     );
  //   }, [order, data]);

  //   const toggleSort = useCallback(() => {
  //     if (!order) {
  //       setOrder("asc");
  //     }

  //     if (order === "asc") {
  //       setOrder("desc");
  //     }

  //     if (order === "desc") {
  //       setOrder("asc");
  //     }
  //   }, [order]);

  return (
    <Box>
      <NavLink
        title="Types"
        endAdornmentProps={{
          tooltipTitle: "Create new type",
          onClick: () => router.push(`/${accountId}/types/new`),
          "data-testid": "create-entity-btn",
        }}
      >
        <Box component="ul">
          {/* Can be uncommented once we have a page that displays all entity types */}
          {/* <Box
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
              <FontAwesomeIcon icon={faSearch} />
            </IconButton>
            <IconButton onClick={toggleSort}>
              <FontAwesomeIcon icon={faArrowUpAZ} />
            </IconButton>
          </Box> */}
          {sortedData.map((entityType) => {
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

                  "&:focus-visible, &:focus-within": {
                    backgroundColor: ({ palette }) => palette.gray[20],

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
                    flex: 1,
                    color: "inherit",
                    outline: "none",
                  }}
                >
                  <Typography
                    variant="smallTextLabels"
                    sx={{
                      display: "block",
                      color: "inherit",
                      py: "7px",
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
};
