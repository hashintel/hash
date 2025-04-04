import type {
  ActorEntityUuid,
  BaseUrl,
  OwnedById,
} from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractOwnedByIdFromEntityId,
} from "@blockprotocol/type-system";
import { WandMagicSparklesIcon } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Fade, Typography } from "@mui/material";
import { subDays, subHours } from "date-fns";
import type {
  Dispatch,
  FunctionComponent,
  ReactNode,
  SetStateAction,
} from "react";
import { useCallback, useMemo } from "react";

import { useOrgs } from "../../../components/hooks/use-orgs";
import { useUsers } from "../../../components/hooks/use-users";
import { AsteriskLightIcon } from "../../../shared/icons/asterisk-light-icon";
import { CalendarDayLightIcon } from "../../../shared/icons/calendar-day-light-icon";
import { CalendarDaysLightIcon } from "../../../shared/icons/calendar-days-light-icon";
import { CalendarLightIcon } from "../../../shared/icons/calendar-light-icon";
import { CalendarWeekLightIcon } from "../../../shared/icons/calendar-week-light-icon";
import { CalendarsLightIcon } from "../../../shared/icons/calendars-light-icon";
import { HashSolidIcon } from "../../../shared/icons/hash-solid-icon";
import { LinkRegularIcon } from "../../../shared/icons/link-regular-icon";
import { UserIcon } from "../../../shared/icons/user-icon";
import { UsersRegularIcon } from "../../../shared/icons/users-regular-icon";
import { Button } from "../../../shared/ui";
import type { MinimalActor } from "../../../shared/use-actors";
import { isAiMachineActor } from "../../../shared/use-actors";
import { useAuthenticatedUser } from "../../shared/auth-info-context";
import { FilterSection } from "./draft-entities-filters/filter-section";
import type { FilterSectionDefinition } from "./draft-entities-filters/types";
import type { EntityTypeDisplayInfoByBaseUrl } from "./types";

const draftEntitiesFiltersColumnWidth = 200;

export type LastEditedTimeRanges =
  | "anytime"
  | "last-24-hours"
  | "last-7-days"
  | "last-30-days"
  | "last-365-days";

const lastEditedTimeRangesToHumanReadable: Record<
  LastEditedTimeRanges,
  string
> = {
  anytime: "Anytime",
  "last-24-hours": "Last 24 hours",
  "last-7-days": "Last 7 days",
  "last-30-days": "Last 30 days",
  "last-365-days": "Last 365 days",
};

const lastEditedTimeRangesToIcon: Record<LastEditedTimeRanges, ReactNode> = {
  anytime: <CalendarLightIcon />,
  "last-24-hours": <CalendarDayLightIcon />,
  "last-7-days": <CalendarWeekLightIcon />,
  "last-30-days": <CalendarDaysLightIcon />,
  "last-365-days": <CalendarsLightIcon />,
};

export type DraftEntityFilterState = {
  entityTypeBaseUrls: BaseUrl[];
  sourceAccountIds: ActorEntityUuid[];
  webOwnedByIds: OwnedById[];
  lastEditedTimeRange: LastEditedTimeRanges;
};

export const getDraftEntityTypeBaseUrls = ({
  draftEntities,
}: {
  draftEntities: Entity[];
}): BaseUrl[] => {
  const baseUrls = draftEntities.flatMap((draftEntity) =>
    draftEntity.metadata.entityTypeIds.map((entityTypeId) =>
      extractBaseUrl(entityTypeId),
    ),
  );

  return Array.from(new Set(baseUrls));
};

const getDraftEntitySources = (params: {
  draftEntitiesWithCreators: {
    entity: Entity;
    creator: MinimalActor;
  }[];
}): MinimalActor[] =>
  params.draftEntitiesWithCreators
    .map(({ creator }) => creator)
    .filter(
      (creator, index, all) =>
        all.findIndex(({ accountId }) => accountId === creator.accountId) ===
        index,
    );

const getDraftEntityWebOwnedByIds = (params: {
  draftEntities: Entity[];
}): OwnedById[] =>
  params.draftEntities
    .map(({ metadata }) =>
      extractOwnedByIdFromEntityId(metadata.recordId.entityId),
    )
    .filter((webOwnedById, index, all) => all.indexOf(webOwnedById) === index);

export const generateDefaultFilterState = (params: {
  draftEntitiesWithCreators: {
    entity: Entity;
    creator: MinimalActor;
  }[];
}): DraftEntityFilterState => {
  const { draftEntitiesWithCreators } = params;

  const entityTypeBaseUrls = getDraftEntityTypeBaseUrls({
    draftEntities: draftEntitiesWithCreators.map(({ entity }) => entity),
  });

  const sources = getDraftEntitySources({
    draftEntitiesWithCreators,
  });

  const webOwnedByIds = getDraftEntityWebOwnedByIds({
    draftEntities: draftEntitiesWithCreators.map(({ entity }) => entity),
  });

  return {
    entityTypeBaseUrls,
    sourceAccountIds: sources.map(({ accountId }) => accountId),
    webOwnedByIds,
    lastEditedTimeRange: "anytime",
  };
};

export const isFilerStateDefaultFilterState =
  (params: {
    draftEntitiesWithCreators: {
      entity: Entity;
      creator: MinimalActor;
    }[];
  }) =>
  (filterState: DraftEntityFilterState): boolean => {
    const { draftEntitiesWithCreators } = params;

    if (filterState.lastEditedTimeRange !== "anytime") {
      return false;
    }

    const entityTypeBaseUrls = getDraftEntityTypeBaseUrls({
      draftEntities: draftEntitiesWithCreators.map(({ entity }) => entity),
    });

    if (filterState.entityTypeBaseUrls.length !== entityTypeBaseUrls.length) {
      return false;
    }

    const sources = getDraftEntitySources({
      draftEntitiesWithCreators,
    });

    if (filterState.sourceAccountIds.length !== sources.length) {
      return false;
    }

    return true;
  };

const isDateWithinLastEditedTimeRange = (params: {
  date: Date;
  lastEditedTimeRange: LastEditedTimeRanges;
}) => {
  const { date, lastEditedTimeRange } = params;
  const now = new Date();
  switch (lastEditedTimeRange) {
    case "anytime":
      return true;
    case "last-24-hours":
      return date >= subHours(now, 1);
    case "last-7-days":
      return date >= subDays(now, 7);
    case "last-30-days":
      return date >= subDays(now, 30);
    case "last-365-days":
      return date >= subDays(now, 365);
    default:
      return true;
  }
};

const draftEntityFilterKinds = [
  "type",
  "source",
  "web",
  "lastEditedBy",
] as const;

type DraftEntityFilterKind = (typeof draftEntityFilterKinds)[number];

export const filterDraftEntities = (params: {
  draftEntitiesWithCreators: {
    entity: Entity;
    creator: MinimalActor;
  }[];
  filterState: DraftEntityFilterState;
  omitFilters?: DraftEntityFilterKind[];
}) => {
  const { draftEntitiesWithCreators, filterState, omitFilters } = params;

  return draftEntitiesWithCreators.filter(
    ({ entity, creator }) =>
      (omitFilters?.includes("type") ||
        filterState.entityTypeBaseUrls.some((baseUrl) =>
          entity.metadata.entityTypeIds.some(
            (entityTypeId) => extractBaseUrl(entityTypeId) === baseUrl,
          ),
        )) &&
      (omitFilters?.includes("source") ||
        filterState.sourceAccountIds.includes(creator.accountId)) &&
      (omitFilters?.includes("web") ||
        filterState.webOwnedByIds.includes(
          extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId),
        )) &&
      (omitFilters?.includes("lastEditedBy") ||
        isDateWithinLastEditedTimeRange({
          date: new Date(
            entity.metadata.temporalVersioning.decisionTime.start.limit,
          ),
          lastEditedTimeRange: filterState.lastEditedTimeRange,
        })),
  );
};

export const DraftEntitiesFilters: FunctionComponent<{
  draftEntitiesWithCreators?: {
    entity: Entity;
    creator: MinimalActor;
  }[];
  draftEntitiesSubgraph?: Subgraph<EntityRootType>;
  entityTypeDisplayInfoByBaseUrl?: EntityTypeDisplayInfoByBaseUrl;
  filterState?: DraftEntityFilterState;
  setFilterState: Dispatch<SetStateAction<DraftEntityFilterState | undefined>>;
}> = ({
  draftEntitiesWithCreators,
  draftEntitiesSubgraph,
  entityTypeDisplayInfoByBaseUrl,
  filterState,
  setFilterState,
}) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const handleClearAll = useCallback(() => {
    if (draftEntitiesWithCreators && draftEntitiesSubgraph) {
      setFilterState(
        generateDefaultFilterState({
          draftEntitiesWithCreators,
        }),
      );
    }
  }, [setFilterState, draftEntitiesWithCreators, draftEntitiesSubgraph]);

  const sources = useMemo(
    () =>
      draftEntitiesWithCreators
        ? getDraftEntitySources({ draftEntitiesWithCreators })
        : undefined,
    [draftEntitiesWithCreators],
  );

  const webOwnedByIds = useMemo(
    () =>
      draftEntitiesWithCreators
        ? getDraftEntityWebOwnedByIds({
            draftEntities: draftEntitiesWithCreators.map(
              ({ entity }) => entity,
            ),
          })
        : undefined,
    [draftEntitiesWithCreators],
  );

  const { orgs } = useOrgs();
  const { users } = useUsers();

  const webs = useMemo(() => {
    if (!orgs || !users || !webOwnedByIds) {
      return undefined;
    }

    return webOwnedByIds.map((webOwnedById) => {
      const org = orgs.find(
        ({ accountGroupId }) => accountGroupId === webOwnedById,
      );

      if (org) {
        return org;
      }

      if (authenticatedUser.accountId === webOwnedById) {
        return authenticatedUser;
      }

      const user = users.find(({ accountId }) => accountId === webOwnedById);

      if (user) {
        return user;
      }

      throw new Error(
        `Could not find web of draft entity with ownedById ${webOwnedById}`,
      );
    });
  }, [webOwnedByIds, orgs, users, authenticatedUser]);

  const filterSections = useMemo<FilterSectionDefinition[]>(() => {
    /**
     * For each filter kind, we want to obtain the draft entities that match
     * all other filters except for the current filter kind. This will be
     * used to display the count of draft entities per filter option.
     */
    const filteredDraftEntitiesExceptForFilter =
      draftEntitiesWithCreators && filterState
        ? draftEntityFilterKinds.reduce<
            Record<
              DraftEntityFilterKind,
              {
                entity: Entity;
                creator: MinimalActor;
              }[]
            >
          >(
            (prev, currentFilterKind) => ({
              ...prev,
              [currentFilterKind]: filterDraftEntities({
                draftEntitiesWithCreators,
                filterState,
                omitFilters: [currentFilterKind],
              }),
            }),
            { type: [], source: [], web: [], lastEditedBy: [] },
          )
        : undefined;

    return [
      {
        kind: "multiple-choice",
        heading: "Type",
        options: Object.values(entityTypeDisplayInfoByBaseUrl ?? {}).map(
          (entityType) => {
            const { baseUrl, icon, isLink, title } = entityType;

            return {
              icon: icon ? (
                <Box marginRight={1.25} maxWidth={14} component="span">
                  {icon}
                </Box>
              ) : isLink ? (
                <LinkRegularIcon />
              ) : (
                <AsteriskLightIcon />
              ),
              label: title,
              value: baseUrl,
              checked: !!filterState?.entityTypeBaseUrls.includes(baseUrl),
              count: filteredDraftEntitiesExceptForFilter?.type.filter(
                ({ entity }) =>
                  entity.metadata.entityTypeIds.some(
                    (typeId) => extractBaseUrl(typeId) === baseUrl,
                  ),
              ).length,
            };
          },
        ),
        onChange: (updatedBaseUrls: BaseUrl[]) =>
          setFilterState((prev) =>
            prev
              ? {
                  ...prev,
                  entityTypeBaseUrls: updatedBaseUrls,
                }
              : undefined,
          ),
      } satisfies FilterSectionDefinition<BaseUrl>,
      {
        kind: "multiple-choice",
        heading: "Source",
        options:
          sources
            ?.map((source) => {
              const label =
                authenticatedUser.accountId === source.accountId
                  ? "Me"
                  : (source.displayName ?? "Unknown");
              return { label, source };
            })
            .sort(
              (
                { label: labelA, source: sourceA },
                { label: labelB, source: sourceB },
              ) => {
                if (authenticatedUser.accountId === sourceA.accountId) {
                  return -1;
                } else if (authenticatedUser.accountId === sourceB.accountId) {
                  return 1;
                }
                return labelA.localeCompare(labelB);
              },
            )
            .map(({ source, label }) => ({
              icon:
                source.kind === "machine" ? (
                  isAiMachineActor(source) ? (
                    <WandMagicSparklesIcon />
                  ) : (
                    <HashSolidIcon />
                  )
                ) : (
                  <UserIcon />
                ),
              label,
              value: source.accountId,
              checked: !!filterState?.sourceAccountIds.includes(
                source.accountId,
              ),
              count: filteredDraftEntitiesExceptForFilter?.source.filter(
                ({ creator }) => creator.accountId === source.accountId,
              ).length,
            })) ?? [],
        onChange: (updatedAccountIds: ActorEntityUuid[]) =>
          setFilterState((prev) =>
            prev
              ? {
                  ...prev,
                  sourceAccountIds: updatedAccountIds,
                }
              : undefined,
          ),
      },
      {
        kind: "multiple-choice",
        heading: "Web",
        options:
          webs
            ?.map((web) => {
              const label =
                web.kind === "user"
                  ? web.accountId === authenticatedUser.accountId
                    ? "My Web"
                    : (web.displayName ?? "Unknown User")
                  : web.name;

              return { label, web };
            })
            .sort(
              ({ label: labelA, web: webA }, { label: labelB, web: webB }) => {
                if (
                  webA.kind === "user" &&
                  authenticatedUser.accountId === webA.accountId
                ) {
                  return -1;
                } else if (
                  webB.kind === "user" &&
                  authenticatedUser.accountId === webB.accountId
                ) {
                  return 1;
                }
                return labelA.localeCompare(labelB);
              },
            )
            .map(({ web, label }) => {
              const webOwnedById = (
                web.kind === "user" ? web.accountId : web.accountGroupId
              ) as OwnedById;
              return {
                icon: web.kind === "user" ? <UserIcon /> : <UsersRegularIcon />,
                label,
                value: webOwnedById,
                checked: !!filterState?.webOwnedByIds.includes(webOwnedById),
                count: filteredDraftEntitiesExceptForFilter?.web.filter(
                  ({ entity }) =>
                    extractOwnedByIdFromEntityId(
                      entity.metadata.recordId.entityId,
                    ) === webOwnedById,
                ).length,
              };
            }) ?? [],
        onChange: (updatedWebOwnedByIds: OwnedById[]) =>
          setFilterState((prev) =>
            prev
              ? {
                  ...prev,
                  webOwnedByIds: updatedWebOwnedByIds,
                }
              : undefined,
          ),
      },
      {
        kind: "single-choice",
        heading: "Last Edited",
        options: Object.entries(lastEditedTimeRangesToHumanReadable).map(
          ([value, label]) => ({
            icon: lastEditedTimeRangesToIcon[value as LastEditedTimeRanges],
            label,
            value,
            count: filteredDraftEntitiesExceptForFilter?.lastEditedBy.filter(
              ({ entity }) =>
                isDateWithinLastEditedTimeRange({
                  date: new Date(
                    entity.metadata.temporalVersioning.decisionTime.start.limit,
                  ),
                  lastEditedTimeRange: value as LastEditedTimeRanges,
                }),
            ).length,
          }),
        ),
        onChange: (updatedLastEditedTimeRange) =>
          setFilterState((prev) =>
            prev
              ? {
                  ...prev,
                  lastEditedTimeRange: updatedLastEditedTimeRange,
                }
              : undefined,
          ),
        value: filterState?.lastEditedTimeRange ?? "anytime",
      },
    ];
  }, [
    draftEntitiesWithCreators,
    filterState,
    entityTypeDisplayInfoByBaseUrl,
    sources,
    webs,
    setFilterState,
    authenticatedUser.accountId,
  ]);

  const allEntityTypesSelected = useMemo(
    () =>
      filterState &&
      entityTypeDisplayInfoByBaseUrl &&
      filterState.entityTypeBaseUrls.length ===
        Object.values(entityTypeDisplayInfoByBaseUrl).length,
    [filterState, entityTypeDisplayInfoByBaseUrl],
  );

  const allSourcesSelected = useMemo(
    () =>
      filterState &&
      sources &&
      filterState.sourceAccountIds.length === sources.length,
    [filterState, sources],
  );

  const allWebsSelected = useMemo(
    () =>
      filterState &&
      webOwnedByIds &&
      filterState.webOwnedByIds.length === webOwnedByIds.length,
    [filterState, webOwnedByIds],
  );

  const isDefaultFilterState = useMemo(
    () =>
      filterState &&
      allEntityTypesSelected &&
      allSourcesSelected &&
      allWebsSelected &&
      filterState.lastEditedTimeRange === "anytime",
    [filterState, allEntityTypesSelected, allSourcesSelected, allWebsSelected],
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        rowGap: 4,
        width: draftEntitiesFiltersColumnWidth,
        flexShrink: 0,
      }}
    >
      <Box display="flex" alignItems="center" columnGap={1.5}>
        <Typography
          sx={{
            fontSize: 16,
            fontWeight: 600,
            color: ({ palette }) => palette.gray[80],
          }}
        >
          Filters
        </Typography>
        <Fade in={filterState && !isDefaultFilterState}>
          <Button
            onClick={handleClearAll}
            variant="tertiary_quiet"
            sx={{
              minHeight: "unset",
              background: "transparent",
              padding: 0,
              "&:hover": {
                background: "transparent",
              },
              color: ({ palette }) => palette.gray[50],
              fontSize: 14,
              fontWeight: 500,
              minWidth: "unset",
            }}
          >
            Clear all
          </Button>
        </Fade>
      </Box>
      {filterSections.map((filterSection) => (
        <FilterSection
          key={filterSection.heading}
          filterSection={filterSection}
        />
      ))}
    </Box>
  );
};
