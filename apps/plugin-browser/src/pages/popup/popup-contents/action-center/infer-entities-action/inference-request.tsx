import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import type { InferEntitiesReturn } from "@local/hash-isomorphic-utils/temporal-types";
import { Box, Skeleton, Typography } from "@mui/material";
import { useMemo, useState } from "react";

import type { PageEntityInference } from "../../../../../shared/storage";
import { InferredEntity } from "./inference-request/inferred-entity";

export const InferenceRequest = ({
  request,
}: {
  request: PageEntityInference;
}) => {
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);

  const { entityTypes, status } = request;

  const inferredEntitiesByType = useMemo(() => {
    return entityTypes.reduce(
      (acc, type) => {
        acc[type.$id] =
          status === "complete"
            ? request.data.contents.filter(
                (entityOrFailure) =>
                  ("metadata" in entityOrFailure
                    ? entityOrFailure.metadata.entityTypeId
                    : entityOrFailure.entityTypeId) === type.$id,
              )
            : [];
        return acc;
      },
      {} as Record<string, InferEntitiesReturn["contents"]>,
    );
  }, [entityTypes, request, status]);

  if (status === "pending" || status === "not-started") {
    return (
      <Skeleton variant="rectangular" height={54} sx={{ borderRadius: 1 }} />
    );
  }

  if (status === "error") {
    return (
      <Typography
        sx={{
          color: ({ palette }) => palette.error.main,
          fontSize: 12,
          px: 1.5,
          py: 1,
        }}
      >
        {request.errorMessage}
      </Typography>
    );
  }

  return (
    <Box>
      {Object.entries(inferredEntitiesByType).map(
        ([typeId, entityStatuses]) => {
          const entityType = request.entityTypes.find(
            (type) => type.$id === typeId,
          );

          if (!entityType) {
            throw new Error(
              `Entity type with id ${typeId} somehow not in status entity types`,
            );
          }

          return (
            <Box
              key={typeId}
              sx={{
                px: 1.5,
                pt: 1,
                pb: 1.5,
                "&:not(:last-child)": {
                  pb: 0,
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
                  {pluralize(entityType.title)}
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
              {entityStatuses.map((entity, index) => {
                const successfullyCreated = "metadata" in entity;

                const locallyUniqueId = successfullyCreated
                  ? entity.metadata.recordId.entityId
                  : entity.temporaryId.toString();

                const expanded = expandedEntityId === locallyUniqueId;

                return (
                  <InferredEntity
                    allEntityStatuses={
                      request.status === "complete" ? request.data.contents : []
                    }
                    entity={entity}
                    entityType={entityType}
                    entityTypes={entityTypes}
                    expanded={expanded}
                    key={locallyUniqueId}
                    indexInType={index}
                    toggleExpanded={() =>
                      expanded
                        ? setExpandedEntityId(null)
                        : setExpandedEntityId(locallyUniqueId)
                    }
                  />
                );
              })}
            </Box>
          );
        },
      )}
    </Box>
  );
};
