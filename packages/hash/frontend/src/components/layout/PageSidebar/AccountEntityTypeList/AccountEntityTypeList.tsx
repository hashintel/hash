import { useCallback, useState, useMemo, useRef, VFC } from "react";

import { Typography, Box } from "@mui/material";
import { faSearch, faArrowUpAZ } from "@fortawesome/free-solid-svg-icons";
import { orderBy } from "lodash";
import { useRouter } from "next/router";
import { useAccountEntityTypes } from "../../../hooks/useAccountEntityTypes";
import { FontAwesomeIcon } from "../../../icons";
import { NavLink } from "../NavLink";
import { Link } from "../../../Link";
import { IconButton } from "../../../IconButton";
import { EntityTypeItem } from "./EntityTypeItem";

type AccountEntityTypeListProps = {
  accountId: string;
};

export const AccountEntityTypeList: VFC<AccountEntityTypeListProps> = ({
  accountId,
}) => {
  const { data } = useAccountEntityTypes(accountId);
  const router = useRouter();

  const [order, setOrder] = useState<"asc" | "desc" | undefined>();

  // const sortedData = useMemo(() => {
  //   return data?.getAccountEntityTypes ?? [];
  // }, [data]);

  const sortedData = useMemo(() => {
    if (!order) {
      return data?.getAccountEntityTypes ?? [];
    }

    return orderBy(
      data?.getAccountEntityTypes ?? [],
      ["properties.title"],
      [order],
    );
  }, [order, data]);

  const toggleSort = useCallback(() => {
    if (!order) {
      setOrder("asc");
    }

    if (order === "asc") {
      setOrder("desc");
    }

    if (order === "desc") {
      setOrder("asc");
    }
  }, [order]);

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
          <Box
            component="li"
            sx={{
              display: "flex",
              alignItems: "center",
              mx: 0.5,
              pl: 3.75,
            }}
          >
            <Link
              href="/"
              noLinkStyle
              sx={{
                mr: "auto",
              }}
            >
              <Typography
                variant="smallTextLabels"
                fontWeight="600"
                sx={({ palette }) => ({ color: palette.gray[80] })}
              >
                View All Types
              </Typography>
            </Link>

            <IconButton sx={{ mr: 1.25 }}>
              <FontAwesomeIcon icon={faSearch} />
            </IconButton>
            <IconButton onClick={toggleSort}>
              <FontAwesomeIcon icon={faArrowUpAZ} />
            </IconButton>
          </Box>
          {sortedData.map((entityType) => {
            return (
              <EntityTypeItem
                key={entityType.entityId}
                title={entityType.properties.title}
                entityId={entityType.entityId}
                accountId={accountId}
                selected={router.query.typeId === entityType.entityId}
              />
            );
          })}
        </Box>
      </NavLink>
    </Box>
  );
};
