import { faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, Select, SelectProps } from "@hashintel/design-system";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  Entity,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import {
  Box,
  Divider,
  Fade,
  inputBaseClasses,
  selectClasses,
  styled,
  Typography,
} from "@mui/material";
import {
  format,
  formatDistanceToNowStrict,
  isBefore,
  subWeeks,
} from "date-fns";
import { Fragment, FunctionComponent, Ref, useMemo, useState } from "react";

import { generateEntityLabel } from "../../lib/entities";
import { Org, User } from "../../lib/user-and-org";
import { ClockRegularIcon } from "../../shared/icons/clock-regular-icon";
import { PageLightIcon } from "../../shared/icons/page-light-icon";
import { Link, MenuItem } from "../../shared/ui";
import { useEntityIcon } from "../../shared/use-entity-icon";
import { ProfilePageTab } from "./util";

const EntityRow: FunctionComponent<{
  entity: Entity;
  profile: User | Org;
  entitiesSubgraph: Subgraph<EntityRootType>;
}> = ({ entity, profile, entitiesSubgraph }) => {
  const label = generateEntityLabel(entitiesSubgraph, entity);

  const href = `/@${profile.shortname}/${
    entity.metadata.entityTypeId === types.entityType.page.entityTypeId
      ? ""
      : "entities/"
  }${extractEntityUuidFromEntityId(entity.metadata.recordId.entityId)}`;

  const updatedAt = new Date(
    entity.metadata.temporalVersioning.decisionTime.start.limit,
  );

  const updatedAtHumanReadable = isBefore(updatedAt, subWeeks(new Date(), 1))
    ? format(updatedAt, "d MMMM yyyy")
    : `${formatDistanceToNowStrict(updatedAt)} ago`;

  const icon = useEntityIcon({
    entity,
    pageIcon: <PageLightIcon sx={{ fontSize: 18 }} />,
  });

  return (
    <Link
      target="_blank"
      noLinkStyle
      href={href}
      sx={{
        h2: {
          transition: ({ transitions }) => transitions.create("color"),
        },
        "&:hover": {
          h2: {
            color: ({ palette }) => palette.blue[70],
          },
        },
      }}
    >
      <Box sx={{ padding: 3 }}>
        <Box
          display="flex"
          alignItems="center"
          columnGap={1.5}
          sx={{
            "> svg": {
              color: ({ palette }) => palette.gray[50],
            },
          }}
        >
          {icon}
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: 14 }}>
            {label}
          </Typography>
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[90],
              fontSize: 11,
              fontWeight: 500,
              textTransform: "uppercase",
            }}
          >
            {updatedAtHumanReadable}
          </Typography>
        </Box>
      </Box>
    </Link>
  );
};

const InlineSelectChevronDown = () => (
  <FontAwesomeIcon
    icon={faCaretDown}
    sx={{ fontSize: 12, position: "absolute", top: 3, right: 4 }}
  />
);

const InlineSelect = styled(
  <T extends {}>(props: SelectProps<T> & { ref?: Ref<HTMLSelectElement> }) => (
    <Select
      variant="standard"
      disableUnderline
      IconComponent={InlineSelectChevronDown}
      {...props}
    />
  ),
)(({ theme }) => ({
  position: "relative",
  top: 1,
  [`.${selectClasses.select}.${inputBaseClasses.input}`]: {
    fontSize: 12,
    height: 12,
    fontWeight: 600,
    color: theme.palette.gray[90],
    minHeight: "unset",
    paddingRight: 18,
    "&:focus": {
      background: "transparent",
    },
  },
}));

type SortOrder = "updated-at-asc" | "updated-at-desc";

const sortOrderHumanReadable: Record<SortOrder, string> = {
  "updated-at-asc": "Oldest",
  "updated-at-desc": "Most Recent",
};

export const PinnedEntityTypeTabContents: FunctionComponent<
  Extract<ProfilePageTab, { kind: "pinned-entity-type" | "profile-pages" }> & {
    profile: User | Org;
  }
> = ({ title, profile, entities, entitiesSubgraph }) => {
  const [sortOrder, setSortOrder] = useState<SortOrder>("updated-at-desc");

  const sortedEntities = useMemo(
    () =>
      entities?.sort((a, b) => {
        const aUpdatedAt = new Date(
          a.metadata.temporalVersioning.decisionTime.start.limit,
        ).getTime();
        const bUpdatedAt = new Date(
          b.metadata.temporalVersioning.decisionTime.start.limit,
        ).getTime();

        return sortOrder === "updated-at-desc"
          ? bUpdatedAt - aUpdatedAt
          : aUpdatedAt - bUpdatedAt;
      }),
    [entities, sortOrder],
  );

  return (
    <Box>
      <Box display="flex" alignItems="center" columnGap={1.5} marginBottom={1}>
        <Typography
          variant="smallCaps"
          sx={{ color: ({ palette }) => palette.gray[70], fontSize: 12 }}
        >
          {title}
        </Typography>
        <Fade in={entities && entities.length > 0}>
          <Box display="flex" alignItems="center" columnGap={1}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 600,
                color: ({ palette }) => palette.gray[70],
              }}
            >
              Sort by
            </Typography>
            <InlineSelect
              startAdornment={
                <ClockRegularIcon
                  sx={{
                    fontSize: 12,
                    marginRight: 0.5,
                    position: "relative",
                    top: -1,
                  }}
                />
              }
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
        </Fade>
      </Box>
      <Fade in={entities && entities.length > 0}>
        <Box
          sx={{
            borderRadius: "4px",
            borderColor: ({ palette }) => palette.gray[30],
            borderStyle: "solid",
            borderWidth: 1,
            background: ({ palette }) => palette.common.white,
            boxShadow: "0px 1px 5px 0px rgba(27, 33, 40, 0.07)",
          }}
        >
          {entitiesSubgraph
            ? sortedEntities?.map((entity, index, all) => {
                return (
                  <Fragment key={entity.metadata.recordId.entityId}>
                    <EntityRow
                      entity={entity}
                      profile={profile}
                      entitiesSubgraph={entitiesSubgraph}
                    />
                    {index < all.length - 1 ? <Divider /> : null}
                  </Fragment>
                );
              })
            : null}
        </Box>
      </Fade>
    </Box>
  );
};
