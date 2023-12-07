import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import type { InferEntitiesReturn } from "@local/hash-isomorphic-utils/temporal-types";
import { Box, Skeleton, Stack, Typography } from "@mui/material";
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

const MetadataItem = ({ label, value }: { label: string; value: string }) => (
  <Stack
    component="span"
    direction="row"
    sx={{ "&:not(:last-child)": { mr: 1.5 } }}
  >
    <Typography sx={{ fontSize: 12, fontWeight: 600, opacity: 0.5, mr: 0.3 }}>
      {label}:
    </Typography>
    <Typography sx={{ fontSize: 12, opacity: 0.6 }}>{value}</Typography>
  </Stack>
);

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

    return entityTypes.reduce((acc, type) => {
      acc[type.schema.$id] =
        status === "complete"
          ? request.data.contents[0].results.filter(
              (result) => result.entityTypeId === type.schema.$id,
            )
          : [];
      return acc;
    }, {} as Record<string, InferEntitiesReturn["contents"][0]["results"]>);
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

  const usage =
    "data" in request &&
    request.data.contents[0].usage.reduce(
      (acc, usageItem) => acc + usageItem.total_tokens,
      0,
    );

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
                      request.status === "complete"
                        ? request.data.contents[0].results
                        : []
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
      <Stack direction="row" justifyContent="flex-end">
        <MetadataItem label="Model" value={request.model} />
        {usage && <MetadataItem label="Tokens used" value={usage.toString()} />}
      </Stack>
    </Box>
  );
};
