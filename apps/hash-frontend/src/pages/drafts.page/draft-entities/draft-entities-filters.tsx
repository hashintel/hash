import { WandMagicSparklesIcon } from "@hashintel/design-system";
import {
  AccountId,
  BaseUrl,
  Entity,
  EntityRootType,
  EntityTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";
import { getEntityTypeById } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import {
  Box,
  Checkbox,
  Fade,
  FormControl,
  FormControlLabel,
  formControlLabelClasses,
  Radio,
  RadioGroup,
  styled,
  Typography,
} from "@mui/material";
import {
  Dispatch,
  FunctionComponent,
  ReactNode,
  SetStateAction,
  useCallback,
  useMemo,
} from "react";

import { useEntityTypesContextRequired } from "../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { AsteriskLightIcon } from "../../../shared/icons/asterisk-light-icon";
import { CalendarDayLightIcon } from "../../../shared/icons/calendar-day-light-icon";
import { CalendarDaysLightIcon } from "../../../shared/icons/calendar-days-light-icon";
import { CalendarLightIcon } from "../../../shared/icons/calendar-light-icon";
import { CalendarWeekLightIcon } from "../../../shared/icons/calendar-week-light-icon";
import { CalendarsLightIcon } from "../../../shared/icons/calendars-light-icon";
import { LinkRegularIcon } from "../../../shared/icons/link-regular-icon";
import { UserIcon } from "../../../shared/icons/user-icon";
import { Button } from "../../../shared/ui";
import { MinimalActor } from "../../../shared/use-actors";
import { useAuthenticatedUser } from "../../shared/auth-info-context";

const CheckboxFilter: FunctionComponent<{
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <FormControlLabel
    sx={{
      borderRadius: 16,
      color: ({ palette }) =>
        checked ? palette.common.black : palette.gray[70],
      marginX: 0,
      flexShrink: 0,
      gap: 2,
      marginBottom: 1,
      [`.${formControlLabelClasses.label}`]: {
        display: "flex",
        alignItems: "center",
        fontSize: 14,
        fontWeight: 500,
        svg: {
          fontSize: 14,
          marginRight: 1.25,
        },
      },
      transition: ({ transitions }) =>
        transitions.create(["background", "color"]),
      "&:hover": {
        background: ({ palette }) => palette.gray[10],
        color: ({ palette }) => palette.gray[90],
      },
    }}
    label={label}
    control={
      <Checkbox
        sx={{
          svg: {
            width: 18,
            height: 18,
          },
        }}
        checked={checked}
        onChange={({ target }) => onChange(target.checked)}
      />
    }
  />
);

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
  sourceAccountIds: AccountId[];
  lastEditedTimeRange: LastEditedTimeRanges;
};

const getDraftEntityTypes = (params: {
  draftEntities: Entity[];
  draftEntitiesSubgraph: Subgraph<EntityRootType>;
}): EntityTypeWithMetadata[] =>
  params.draftEntities
    .map((draftEntity) => draftEntity.metadata.entityTypeId)
    .filter((entityTypeId, index, all) => all.indexOf(entityTypeId) === index)
    .map((entityTypeId) => {
      const entityType = getEntityTypeById(
        params.draftEntitiesSubgraph,
        entityTypeId,
      );

      if (!entityType) {
        throw new Error(
          `Could not find entity type ${entityTypeId} in draft entities subgraph`,
        );
      }
      return entityType;
    });

const getDraftEntitySources = (params: {
  draftEntitiesWithCreatedAtAndCreators: {
    entity: Entity;
    createdAt: Date;
    creator: MinimalActor;
  }[];
}): MinimalActor[] =>
  params.draftEntitiesWithCreatedAtAndCreators
    .map(({ creator }) => creator)
    .filter(
      (creator, index, all) =>
        all.findIndex(({ accountId }) => accountId === creator.accountId) ===
        index,
    );

export const generateDefaultFilterState = (params: {
  draftEntitiesWithCreatedAtAndCreators: {
    entity: Entity;
    createdAt: Date;
    creator: MinimalActor;
  }[];
  draftEntitiesSubgraph: Subgraph<EntityRootType>;
}): DraftEntityFilterState => {
  const { draftEntitiesWithCreatedAtAndCreators, draftEntitiesSubgraph } =
    params;

  const entityTypes = getDraftEntityTypes({
    draftEntities: draftEntitiesWithCreatedAtAndCreators.map(
      ({ entity }) => entity,
    ),
    draftEntitiesSubgraph,
  });

  const sources = getDraftEntitySources({
    draftEntitiesWithCreatedAtAndCreators,
  });

  return {
    entityTypeBaseUrls: entityTypes.map((entityType) =>
      extractBaseUrl(entityType.schema.$id),
    ),
    sourceAccountIds: sources.map(({ accountId }) => accountId),
    lastEditedTimeRange: "anytime",
  };
};

export const FilterSectionHeading = styled(Typography)(({ theme }) => ({
  color: theme.palette.gray[70],
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  marginBottom: theme.spacing(1.5),
}));

export const DraftEntitiesFilters: FunctionComponent<{
  draftEntitiesWithCreatedAtAndCreators?: {
    entity: Entity;
    createdAt: Date;
    creator: MinimalActor;
  }[];
  draftEntitiesSubgraph?: Subgraph<EntityRootType>;
  filterState?: DraftEntityFilterState;
  setFilterState: Dispatch<SetStateAction<DraftEntityFilterState | undefined>>;
}> = ({
  draftEntitiesWithCreatedAtAndCreators,
  draftEntitiesSubgraph,
  filterState,
  setFilterState,
}) => {
  const { authenticatedUser } = useAuthenticatedUser();
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const handleClearAll = useCallback(() => {
    if (draftEntitiesWithCreatedAtAndCreators && draftEntitiesSubgraph) {
      setFilterState(
        generateDefaultFilterState({
          draftEntitiesWithCreatedAtAndCreators,
          draftEntitiesSubgraph,
        }),
      );
    }
  }, [
    setFilterState,
    draftEntitiesWithCreatedAtAndCreators,
    draftEntitiesSubgraph,
  ]);

  const entityTypes = useMemo(
    () =>
      draftEntitiesWithCreatedAtAndCreators && draftEntitiesSubgraph
        ? getDraftEntityTypes({
            draftEntities: draftEntitiesWithCreatedAtAndCreators.map(
              ({ entity }) => entity,
            ),
            draftEntitiesSubgraph,
          }).sort((a, b) => a.schema.title.localeCompare(b.schema.title))
        : undefined,
    [draftEntitiesWithCreatedAtAndCreators, draftEntitiesSubgraph],
  );

  const sources = useMemo(
    () =>
      draftEntitiesWithCreatedAtAndCreators
        ? getDraftEntitySources({ draftEntitiesWithCreatedAtAndCreators })
        : undefined,
    [draftEntitiesWithCreatedAtAndCreators],
  );

  const allEntityTypesSelected = useMemo(
    () =>
      filterState &&
      entityTypes &&
      filterState.entityTypeBaseUrls.length === entityTypes.length,
    [filterState, entityTypes],
  );

  const allSourcesSelected = useMemo(
    () =>
      filterState &&
      sources &&
      filterState.sourceAccountIds.length === sources.length,
    [filterState, sources],
  );

  const isDefaultFilterState = useMemo(
    () =>
      filterState &&
      allEntityTypesSelected &&
      allSourcesSelected &&
      filterState.lastEditedTimeRange === "anytime",
    [filterState, allEntityTypesSelected, allSourcesSelected],
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
      <Box>
        <FilterSectionHeading>Types</FilterSectionHeading>
        <Box display="flex" flexDirection="column">
          {entityTypes?.map((entityType) => {
            const entityTypeBaseUrl = extractBaseUrl(entityType.schema.$id);

            return (
              <CheckboxFilter
                key={entityType.schema.$id}
                label={
                  <>
                    {entityType.metadata.icon ? (
                      <Box marginRight={1.25} maxWidth={14} component="span">
                        {entityType.metadata.icon}
                      </Box>
                    ) : isSpecialEntityTypeLookup?.[entityType.schema.$id]
                        ?.isLink ? (
                      <LinkRegularIcon />
                    ) : (
                      <AsteriskLightIcon />
                    )}
                    {entityType.schema.title}
                  </>
                }
                checked={
                  !!filterState?.entityTypeBaseUrls.includes(entityTypeBaseUrl)
                }
                onChange={(updatedChecked) =>
                  setFilterState((prev) =>
                    prev
                      ? {
                          ...prev,
                          entityTypeBaseUrls: updatedChecked
                            ? [...prev.entityTypeBaseUrls, entityTypeBaseUrl]
                            : prev.entityTypeBaseUrls.filter(
                                (baseUrl) => baseUrl !== entityTypeBaseUrl,
                              ),
                        }
                      : undefined,
                  )
                }
              />
            );
          })}
        </Box>
      </Box>
      <Box>
        <FilterSectionHeading>Source</FilterSectionHeading>
        <Box display="flex" flexDirection="column">
          {sources
            ?.map((source) => {
              const label =
                authenticatedUser.accountId === source.accountId
                  ? "Me"
                  : "preferredName" in source
                    ? source.preferredName!
                    : "displayName" in source
                      ? source.displayName
                      : "Unknown";

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
            .map(({ source, label }) => (
              <CheckboxFilter
                key={source.accountId}
                label={
                  <>
                    {"displayName" in source &&
                    source.displayName === "HASH AI" ? (
                      <WandMagicSparklesIcon />
                    ) : (
                      <UserIcon />
                    )}
                    {label}
                  </>
                }
                checked={
                  !!filterState?.sourceAccountIds.includes(source.accountId)
                }
                onChange={(checked) =>
                  setFilterState((prev) =>
                    prev
                      ? {
                          ...prev,
                          sourceAccountIds: checked
                            ? [...prev.sourceAccountIds, source.accountId]
                            : prev.sourceAccountIds.filter(
                                (accountId) => accountId !== source.accountId,
                              ),
                        }
                      : undefined,
                  )
                }
              />
            ))}
        </Box>
      </Box>
      <Box>
        <FilterSectionHeading>Last edited</FilterSectionHeading>
        <FormControl>
          <RadioGroup
            value={filterState?.lastEditedTimeRange ?? "anytime"}
            onChange={(event) =>
              setFilterState((prev) =>
                prev
                  ? {
                      ...prev,
                      lastEditedTimeRange: event.target
                        .value as LastEditedTimeRanges,
                    }
                  : undefined,
              )
            }
          >
            {Object.entries(lastEditedTimeRangesToHumanReadable).map(
              ([value, label]) => {
                return (
                  <FormControlLabel
                    key={value}
                    value={value}
                    control={<Radio />}
                    label={
                      <>
                        {
                          lastEditedTimeRangesToIcon[
                            value as LastEditedTimeRanges
                          ]
                        }
                        {label}
                      </>
                    }
                    sx={{
                      marginX: 0,
                      marginBottom: 1,
                      color: ({ palette }) =>
                        filterState?.lastEditedTimeRange === value
                          ? palette.common.black
                          : palette.gray[70],
                      [`.${formControlLabelClasses.label}`]: {
                        display: "flex",
                        alignItems: "center",
                        fontSize: 14,
                        marginLeft: 2,
                        fontWeight: 500,
                        svg: {
                          fontSize: 14,
                          marginRight: 1.25,
                        },
                      },
                      "&:hover": {
                        color: ({ palette }) => palette.gray[90],
                      },
                    }}
                  />
                );
              },
            )}
          </RadioGroup>
        </FormControl>
      </Box>
    </Box>
  );
};
