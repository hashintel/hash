import { subDays, subHours } from "date-fns";

import {
  extractBaseUrl,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";

import type { MinimalActor } from "../../../shared/use-actors";
import type { LastEditedTimeRanges } from "./draft-entities-filters";
import type {
  ActorEntityUuid,
  BaseUrl,
  WebId,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

export type DraftEntityFilterState = {
  entityTypeBaseUrls: BaseUrl[];
  sourceAccountIds: ActorEntityUuid[];
  webWebIds: WebId[];
  lastEditedTimeRange: LastEditedTimeRanges;
};

export const getDraftEntityTypeBaseUrls = ({
  draftEntities,
}: {
  draftEntities: HashEntity[];
}): BaseUrl[] => {
  const baseUrls = draftEntities.flatMap((draftEntity) =>
    draftEntity.metadata.entityTypeIds.map((entityTypeId) =>
      extractBaseUrl(entityTypeId),
    ),
  );

  return Array.from(new Set(baseUrls));
};

export const getDraftEntitySources = (params: {
  draftEntitiesWithCreators: {
    entity: HashEntity;
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

export const getDraftEntityWebIds = (params: {
  draftEntities: HashEntity[];
}): WebId[] =>
  params.draftEntities
    .map(({ metadata }) => extractWebIdFromEntityId(metadata.recordId.entityId))
    .filter((webWebId, index, all) => all.indexOf(webWebId) === index);

export const generateDefaultFilterState = (params: {
  draftEntitiesWithCreators: {
    entity: HashEntity;
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

  const webWebIds = getDraftEntityWebIds({
    draftEntities: draftEntitiesWithCreators.map(({ entity }) => entity),
  });

  return {
    entityTypeBaseUrls,
    sourceAccountIds: sources.map(({ accountId }) => accountId),
    webWebIds,
    lastEditedTimeRange: "anytime",
  };
};

export const isFilerStateDefaultFilterState =
  (params: {
    draftEntitiesWithCreators: {
      entity: HashEntity;
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

export const isDateWithinLastEditedTimeRange = (params: {
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

export const draftEntityFilterKinds = [
  "type",
  "source",
  "web",
  "lastEditedBy",
] as const;

export type DraftEntityFilterKind = (typeof draftEntityFilterKinds)[number];

export const filterDraftEntities = (params: {
  draftEntitiesWithCreators: {
    entity: HashEntity;
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
        filterState.webWebIds.includes(
          extractWebIdFromEntityId(entity.metadata.recordId.entityId),
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
