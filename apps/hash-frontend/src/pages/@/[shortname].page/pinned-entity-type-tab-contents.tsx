import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { EntityTypeWithMetadata, WebId } from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { EntityOrTypeIcon } from "@hashintel/design-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  blockProtocolEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { includesPageEntityTypeId } from "@local/hash-isomorphic-utils/page-entity-type-ids";
import {
  Box,
  Divider,
  Fade,
  Skeleton,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  format,
  formatDistanceToNowStrict,
  isBefore,
  subWeeks,
} from "date-fns";
import type { FunctionComponent } from "react";
import { Fragment, useCallback, useMemo, useState } from "react";

import { useAccountPages } from "../../../components/hooks/use-account-pages";
import { useCreatePage } from "../../../components/hooks/use-create-page";
import type { Org, User } from "../../../lib/user-and-org";
import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { ArrowDownAZRegularIcon } from "../../../shared/icons/arrow-down-a-z-regular-icon";
import { ArrowUpZARegularIcon } from "../../../shared/icons/arrow-up-a-z-regular-icon";
import { ClockRegularIcon } from "../../../shared/icons/clock-regular-icon";
import { PlusRegularIcon } from "../../../shared/icons/plus-regular";
import { Button, Link, MenuItem } from "../../../shared/ui";
import { InlineSelect } from "../../shared/inline-select";
import { ProfileSectionHeading } from "../[shortname]/shared/profile-section-heading";
import type { ProfilePageTab } from "./util";

const EntityRow: FunctionComponent<{
  entity: HashEntity;
  entityType?: EntityTypeWithMetadata;
  profile: User | Org;
  entitiesSubgraph: Subgraph<EntityRootType>;
}> = ({ entity, entityType, profile, entitiesSubgraph }) => {
  const label = generateEntityLabel(entitiesSubgraph, entity);

  const href = `/@${profile.shortname}/${
    includesPageEntityTypeId(entity.metadata.entityTypeIds) ? "" : "entities/"
  }${extractEntityUuidFromEntityId(entity.metadata.recordId.entityId)}`;

  const updatedAt = new Date(
    entity.metadata.temporalVersioning.decisionTime.start.limit,
  );

  const updatedAtHumanReadable = isBefore(updatedAt, subWeeks(new Date(), 1))
    ? format(updatedAt, "d MMMM yyyy")
    : `${formatDistanceToNowStrict(updatedAt)} ago`;

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
        <Box display="flex" alignItems="center" columnGap={1.5}>
          <EntityOrTypeIcon
            entity={null}
            icon={entityType?.schema.icon}
            fontSize={14}
            fill={({ palette }) => palette.blue[70]}
            isLink={
              /**
               * @todo H-3363 use closed schema to take account of indirectly inherited link status
               */
              entityType?.schema.$id ===
                blockProtocolEntityTypes.link.entityTypeId ||
              !!entityType?.schema.allOf?.some(
                (allOf) =>
                  allOf.$ref === blockProtocolEntityTypes.link.entityTypeId,
              )
            }
          />
          <Typography component="h2" sx={{ fontWeight: 700, fontSize: 14 }}>
            {label}
          </Typography>
          <Tooltip title={format(updatedAt, "MMMM do yyyy, h:mm a")}>
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
          </Tooltip>
        </Box>
      </Box>
    </Link>
  );
};

type SortOrder =
  | "updated-at-asc"
  | "updated-at-desc"
  | "alphabetical-asc"
  | "alphabetical-desc";

const sortOrderHumanReadable: Record<SortOrder, string> = {
  "updated-at-asc": "Last edited (oldest first)",
  "updated-at-desc": "Last edited (newest first)",
  "alphabetical-asc": "Alphabetical (A-Z)",
  "alphabetical-desc": "Alphabetical (Z-A)",
};

export const PinnedEntityTypeTabContents: FunctionComponent<{
  currentTab: Extract<ProfilePageTab, { kind: "pinned-entity-type" }>;
  profile: User | Org;
  isEditable: boolean;
}> = ({ currentTab, profile, isEditable }) => {
  const { entities, entitiesSubgraph } = currentTab;

  const [sortOrder, setSortOrder] = useState<SortOrder>("updated-at-desc");

  const webId = (
    profile.kind === "user" ? profile.accountId : profile.webId
  ) as WebId;

  const { lastRootPageIndex } = useAccountPages(webId);
  const [createUntitledPage] = useCreatePage({
    shortname: profile.shortname,
    webId,
  });

  const createPage = useCallback(async () => {
    await createUntitledPage(lastRootPageIndex, "document");
  }, [lastRootPageIndex, createUntitledPage]);

  const sortedEntities = useMemo(
    () =>
      entities?.sort((a, b) => {
        if (sortOrder.startsWith("updated-at")) {
          const aUpdatedAt = new Date(
            a.metadata.temporalVersioning.decisionTime.start.limit,
          ).getTime();
          const bUpdatedAt = new Date(
            b.metadata.temporalVersioning.decisionTime.start.limit,
          ).getTime();

          return sortOrder === "updated-at-desc"
            ? bUpdatedAt - aUpdatedAt
            : aUpdatedAt - bUpdatedAt;
        }

        if (!entitiesSubgraph) {
          return 0;
        }

        const aLabel = generateEntityLabel(entitiesSubgraph, a);

        const bLabel = generateEntityLabel(entitiesSubgraph, b);

        return sortOrder === "alphabetical-desc"
          ? bLabel.localeCompare(aLabel)
          : aLabel.localeCompare(bLabel);
      }),
    [entities, entitiesSubgraph, sortOrder],
  );

  const isPagesTab =
    currentTab.entityTypeBaseUrl === systemEntityTypes.page.entityTypeBaseUrl;

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const isLinkEntityType = currentTab.entityType
    ? isSpecialEntityTypeLookup?.[currentTab.entityType.schema.$id]?.isLink
    : undefined;

  return (
    <Box mb={6}>
      <Box display="flex" alignItems="center" columnGap={1.5} marginBottom={1}>
        <ProfileSectionHeading>{currentTab.pluralTitle}</ProfileSectionHeading>
        <Box display="flex" alignItems="center" columnGap={0.5}>
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
              sortOrder === "alphabetical-asc" ? (
                <ArrowDownAZRegularIcon />
              ) : sortOrder === "alphabetical-desc" ? (
                <ArrowUpZARegularIcon />
              ) : (
                <ClockRegularIcon />
              )
            }
            sx={{
              svg: {
                fontSize: 12,
                marginRight: 0.5,
                position: "relative",
              },
            }}
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
      </Box>
      <Fade in={!!entities && !!entitiesSubgraph}>
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
          {sortedEntities?.length === 0 ? (
            <Box
              padding={6}
              display="flex"
              flexDirection="column"
              alignItems="center"
            >
              <Typography
                gutterBottom
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  fontSize: 21,
                  fontWeight: 600,
                }}
              >
                No {currentTab.pluralTitle?.toLowerCase()} could be found
              </Typography>
              <Typography
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  fontSize: 16,
                  fontWeight: 500,
                }}
              >
                No {currentTab.pluralTitle?.toLowerCase()} could be found in @
                {profile.shortname}
              </Typography>
              {isEditable && !isLinkEntityType ? (
                <Box marginTop={2}>
                  <Button
                    startIcon={<PlusRegularIcon />}
                    size="small"
                    href={
                      !isPagesTab && currentTab.entityType
                        ? `/new/entity?entity-type-id=${encodeURIComponent(
                            currentTab.entityType.schema.$id,
                          )}`
                        : undefined
                    }
                    onClick={isPagesTab ? createPage : undefined}
                  >
                    Create a {currentTab.title}
                  </Button>
                </Box>
              ) : null}
            </Box>
          ) : entitiesSubgraph ? (
            sortedEntities?.map((entity, index, all) => {
              return (
                <Fragment key={entity.metadata.recordId.entityId}>
                  <EntityRow
                    entity={entity}
                    entityType={currentTab.entityType}
                    profile={profile}
                    entitiesSubgraph={entitiesSubgraph}
                  />
                  {index < all.length - 1 ? <Divider /> : null}
                </Fragment>
              );
            })
          ) : (
            <Box sx={{ padding: 3 }} display="flex" columnGap={1.5}>
              <Skeleton sx={{ width: 15 }} />
              <Skeleton variant="text" width={100} />
              <Skeleton variant="text" width={60} />
            </Box>
          )}
        </Box>
      </Fade>
    </Box>
  );
};
