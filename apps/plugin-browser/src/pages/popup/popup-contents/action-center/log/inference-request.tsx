import { pluralize } from "@local/hash-isomorphic-utils/src/pluralize";
import type { InferEntitiesReturn } from "@local/hash-isomorphic-utils/src/temporal-types";
import { Box, Skeleton, Typography } from "@mui/material";
import { useMemo, useState } from "react";

import type {
  LocalStorage,
  PageEntityInference,
} from "../../../../../shared/storage";
import {
  darkModeBorderColor,
  darkModeInputBackgroundColor,
} from "../../../../shared/style-values";
import { useEntityTypes } from "../../../../shared/use-entity-types";
import { InferredEntity } from "./inference-request/inferred-entity";

export const InferenceRequest = ({
  request,
  user,
}: {
  request: PageEntityInference;
  user: NonNullable<LocalStorage["user"]>;
}) => {
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);
  const allEntityTypes = useEntityTypes();

  const { entityTypeIds, status } = request;

  const inferredEntitiesByType = useMemo(() => {
    const entityTypes = allEntityTypes.filter((type) =>
      entityTypeIds.some((typeId) => typeId === type.schema.$id),
    );

    return entityTypes.reduce(
      (acc, type) => {
        acc[type.schema.$id] =
          status === "complete"
            ? request.data.contents.filter(
                (result) => result.entityTypeId === type.schema.$id,
              )
            : [];
        return acc;
      },
      {} as Record<string, InferEntitiesReturn["contents"]>,
    );
  }, [allEntityTypes, entityTypeIds, request, status]);

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
                px: 1.5,
                pt: 1,
                pb: 1.5,
                "&:not(:last-child)": {
                  pb: 0,
                },
                borderRadius: 1,
                "@media (prefers-color-scheme: dark)": {
                  borderColor: darkModeBorderColor,
                  background: darkModeInputBackgroundColor,
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
                      request.status === "complete" ? request.data.contents : []
                    }
                    entityType={entityType}
                    entityTypes={allEntityTypes}
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
    </Box>
  );
};
