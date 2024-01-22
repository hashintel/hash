import type { InferEntitiesReturn } from "@local/hash-isomorphic-utils/ai-inference-types";
import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import { Box, Link, Skeleton, Stack, Typography } from "@mui/material";
import { formatDuration, intervalToDuration } from "date-fns";
import { useEffect, useMemo, useState } from "react";

import type {
  LocalStorage,
  PageEntityInference,
} from "../../../../../shared/storage";
import {
  borderColors,
  darkModeBorderColor,
} from "../../../../shared/style-values";
import { useEntityTypes } from "../../../../shared/use-entity-types";
import { CopyableRequestId } from "./inference-request/copyable-request-id";
import { InferredEntity } from "./inference-request/inferred-entity";

const metadataFontSize = 12;

const MetadataItem = ({ label, value }: { label: string; value: string }) => (
  <Stack component="span" direction="row">
    <Typography
      sx={{
        fontSize: metadataFontSize,
        fontWeight: 600,
        opacity: 0.5,
      }}
    >
      {label}:{` `}
    </Typography>
    <Typography sx={{ fontSize: metadataFontSize, opacity: 0.6, ml: 0.2 }}>
      {value}
    </Typography>
  </Stack>
);

const generateDurationString = (interval: Interval) =>
  formatDuration(intervalToDuration(interval));

const InferenceMetadata = ({ request }: { request: PageEntityInference }) => {
  const [timeElapsed, setTimeElapsed] = useState(() =>
    generateDurationString({
      start: new Date(request.createdAt),
      end: new Date(request.finishedAt || Date.now()),
    }),
  );

  const usage =
    "data" in request &&
    request.data.contents[0]?.usage.reduce(
      (acc, usageItem) => acc + usageItem.total_tokens,
      0,
    );

  useEffect(() => {
    if (!request.finishedAt) {
      setTimeout(() => {
        setTimeElapsed(
          generateDurationString({
            start: new Date(request.createdAt),
            end: new Date(request.finishedAt || Date.now()),
          }),
        );
      }, 1_000);
    }
  });

  return (
    <Box>
      <Stack
        alignItems="center"
        direction="row"
        justifyContent="space-between"
        sx={() => ({
          borderTopWidth: 1,
          borderTopStyle: "solid",
          ...borderColors,
          pt: 0.5,
        })}
      >
        <Link
          component="a"
          href={request.sourceUrl}
          sx={{
            fontSize: metadataFontSize,
          }}
          target="blank"
        >
          View source page
        </Link>
        <MetadataItem label="Model" value={request.model} />
        {usage && <MetadataItem label="Tokens" value={usage.toString()} />}
        <MetadataItem label="Time" value={timeElapsed} />
      </Stack>
      <CopyableRequestId requestId={request.requestUuid} />
    </Box>
  );
};

export const InferenceRequest = ({
  request,
  user,
}: {
  request: PageEntityInference;
  user: NonNullable<LocalStorage["user"]>;
}) => {
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);
  const { entityTypes: allEntityTypes, entityTypesSubgraph } = useEntityTypes();

  const { entityTypeIds, status } = request;

  const inferredEntitiesByType = useMemo(() => {
    const entityTypes = allEntityTypes.filter((type) =>
      entityTypeIds.some((typeId) => typeId === type.schema.$id),
    );

    return entityTypes.reduce(
      (acc, type) => {
        acc[type.schema.$id] =
          status === "complete"
            ? request.data.contents[0]?.results.filter(
                (result) => result.entityTypeId === type.schema.$id,
              ) ?? []
            : [];
        return acc;
      },
      {} as Record<string, InferEntitiesReturn["contents"][0]["results"]>,
    );
  }, [allEntityTypes, entityTypeIds, request, status]);

  if (
    status === "pending" ||
    status === "not-started" ||
    !entityTypesSubgraph
  ) {
    return (
      <Box px={1.5} py={1}>
        <Skeleton
          variant="rectangular"
          height={54}
          sx={{ borderRadius: 1, mb: 1.5 }}
        />
        <InferenceMetadata request={request} />
      </Box>
    );
  }

  if (status === "error") {
    return (
      <Box px={1.5} py={1}>
        <Typography
          sx={{
            color: ({ palette }) => palette.error.main,
            fontSize: 12,
            pb: 1,
          }}
        >
          {request.errorMessage}
        </Typography>
        <InferenceMetadata request={request} />
      </Box>
    );
  }

  return (
    <Box sx={{ px: 1.5, py: 1 }}>
      {Object.entries(inferredEntitiesByType).map(
        ([typeId, entityStatuses]) => {
          const entityType = allEntityTypes.find(
            (type) => type.schema.$id === typeId,
          );

          if (!entityType) {
            throw new Error(
              `Entity type with id ${typeId} somehow not in all entity types`,
            );
          }

          return (
            <Box
              key={typeId}
              sx={{
                "&:not(:last-child)": {
                  pb: 1,
                },
                borderRadius: 1,
                "@media (prefers-color-scheme: dark)": {
                  borderColor: darkModeBorderColor,
                },
              }}
            >
              <Box>
                <Typography
                  variant="smallCaps"
                  sx={{
                    color: ({ palette }) => palette.gray[50],
                    fontSize: 12,
                  }}
                >
                  {pluralize(entityType.schema.title)}
                </Typography>
              </Box>
              {entityStatuses.length === 0 && (
                <Typography
                  variant="microText"
                  sx={{
                    color: ({ palette }) => palette.gray[60],
                    fontSize: 13,
                  }}
                >
                  No entities inferred.
                </Typography>
              )}
              {entityStatuses.map((result, index) => {
                const locallyUniqueId =
                  result.proposedEntity.entityId.toString();

                const expanded = expandedEntityId === locallyUniqueId;

                return (
                  <InferredEntity
                    allEntityStatuses={
                      request.status === "complete"
                        ? request.data.contents[0]?.results ?? []
                        : []
                    }
                    entityType={entityType}
                    entityTypes={allEntityTypes}
                    entityTypesSubgraph={entityTypesSubgraph}
                    expanded={expanded}
                    key={locallyUniqueId}
                    indexInType={index}
                    result={result}
                    toggleExpanded={() =>
                      expanded
                        ? setExpandedEntityId(null)
                        : setExpandedEntityId(locallyUniqueId)
                    }
                    user={user}
                  />
                );
              })}
            </Box>
          );
        },
      )}
      <InferenceMetadata request={request} />
    </Box>
  );
};
