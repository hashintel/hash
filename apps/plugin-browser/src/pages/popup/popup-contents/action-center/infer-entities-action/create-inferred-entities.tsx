import {
  EntityPropertyValue,
  EntityType,
  VersionedUrl,
} from "@blockprotocol/graph";
import { ArrowUpRightIcon, Button } from "@hashintel/design-system";
import { ProposedEntity } from "@local/hash-graphql-shared/graphql/api-types.gen";
import {
  Simplified,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { Entity, EntityId, LinkData, OwnedById } from "@local/hash-subgraph";
import { Box, Checkbox, CircularProgress, Typography } from "@mui/material";
import pluralize from "pluralize";
import { useMemo, useState } from "react";

import { queryApi } from "../../../../shared/query-api";

// @todo consolidate this with generateEntityLabel in hash-frontend
const generateEntityLabel = (
  entityToLabel: ProposedEntity,
  entityType: EntityType,
  index: number,
) => {
  const simplifiedProperties = simplifyProperties(
    entityToLabel.properties,
  ) as Record<string, EntityPropertyValue>;

  // fallback to some likely display name properties
  const options = [
    "name",
    "preferredName",
    "displayName",
    "title",
    "organizationName",
    "shortname",
  ];

  for (const option of options) {
    if (
      simplifiedProperties[option] &&
      typeof simplifiedProperties[option] === "string"
    ) {
      return simplifiedProperties[option] as string;
    }
  }

  return `${entityType.title}-${index + 1}`;
};

const createEntityMutation = /* GraphQL */ `
  mutation createEntity(
    $entityTypeId: VersionedUrl!
    $ownedById: OwnedById
    $properties: EntityPropertiesObject!
    $linkData: LinkData
  ) {
    # This is a scalar, which has no selection.
    createEntity(
      entityTypeId: $entityTypeId
      ownedById: $ownedById
      properties: $properties
      linkData: $linkData
    )
  }
`;

type CreationStatus = "errored" | "pending" | "skipped" | EntityId;

type CreationStatuses = Record<string, CreationStatus>;

const createEntity = (variables: {
  entityTypeId: VersionedUrl;
  linkData?: LinkData;
  ownedById: OwnedById;
  properties: Record<string, EntityPropertyValue>;
}) => {
  return queryApi(createEntityMutation, variables).then(
    ({ data }: { data: { createEntity: Entity } }) => {
      return data.createEntity;
    },
  );
};

export type ProposedEntityWithUuid = ProposedEntity & { tempUuid: string };

type CreateInferredEntitiesProps = {
  inferredEntities: ProposedEntityWithUuid[];
  user: Simplified<User>;
  reset: () => void;
  targetEntityTypes: EntityType[];
};

export const CreateInferredEntities = ({
  inferredEntities,
  reset,
  targetEntityTypes,
  user,
}: CreateInferredEntitiesProps) => {
  const [entitiesToCreate, setEntitiesToCreate] =
    useState<ProposedEntityWithUuid[]>(inferredEntities);
  const [creationStatuses, setCreationStatuses] = useState<CreationStatuses>(
    {},
  );
  const [overallStatus, setOverallStatus] = useState<
    "pending" | "done" | "not-started"
  >("not-started");

  const inferredEntitiesByType = useMemo(() => {
    return targetEntityTypes.reduce((acc, type) => {
      acc[type.$id] = inferredEntities.filter(
        (entity) => entity.entityTypeId === type.$id,
      );
      return acc;
    }, {} as Record<string, ProposedEntityWithUuid[]>);
  }, [inferredEntities, targetEntityTypes]);

  const createEntities = async () => {
    setOverallStatus("pending");

    const initialStatuses: CreationStatuses = {};
    for (const entity of inferredEntities) {
      if (entitiesToCreate.includes(entity)) {
        initialStatuses[entity.tempUuid] = "pending";
      } else {
        initialStatuses[entity.tempUuid] = "skipped";
      }
    }
    setCreationStatuses(initialStatuses);

    await Promise.all(
      entitiesToCreate.map(async (entityToCreate) => {
        try {
          const entity = await createEntity({
            entityTypeId: entityToCreate.entityTypeId,
            linkData: entityToCreate.linkData ?? undefined,
            // @todo figure out why extractOwnedByIdFromEntityId has WASM in its evaluation path
            ownedById: user.metadata.recordId.entityId.split(
              "~",
            )[1] as OwnedById,
            properties: entityToCreate.properties,
          });
          setCreationStatuses((statuses) => {
            return {
              ...statuses,
              [entityToCreate.tempUuid]: entity.metadata.recordId.entityId,
            };
          });
        } catch (err) {
          setCreationStatuses((statuses) => {
            return {
              ...statuses,
              [entityToCreate.tempUuid]: "errored",
            };
          });
        }
      }),
    );

    setOverallStatus("done");
  };

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        if (overallStatus === "pending" || overallStatus === "done") {
          return;
        }
        event.preventDefault();
        void createEntities();
      }}
    >
      {Object.entries(inferredEntitiesByType).map(([typeId, entities]) => {
        const entityType = targetEntityTypes.find(
          (type) => type.$id === typeId,
        );
        if (!entityType) {
          throw new Error(
            `Entity type with id ${typeId} somehow not in target entity types`,
          );
        }

        return (
          <Box
            key={typeId}
            sx={({ palette, boxShadows }) => ({
              backgroundColor: palette.common.white,
              borderRadius: 2,
              border: `1px solid ${palette.gray[20]}`,
              boxShadow: boxShadows.xs,
              mb: 2,
              p: 2,
            })}
          >
            <Box mb={1}>
              <Typography
                variant="smallCaps"
                sx={{
                  color: ({ palette }) => palette.gray[50],
                  fontSize: 13,
                }}
              >
                {pluralize(entityType.title)}
              </Typography>
            </Box>
            {entities.map((entity, index) => {
              const status = creationStatuses[entity.tempUuid];

              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- TODO this is potentially undefined
              const successfullyCreated = status && status.includes("~");

              return (
                <Box
                  component={successfullyCreated ? "a" : "div"}
                  href={
                    successfullyCreated
                      ? `${FRONTEND_ORIGIN}/@${user.properties
                          .shortname!}/entities/${status.split("~")[1]}`
                      : undefined
                  }
                  key={entity.tempUuid}
                  sx={{
                    alignItems: "center",
                    display: "flex",
                    justifyContent: "space-between",
                    pt: 0.7,
                    "&:not(:last-child)": {
                      borderBottom: ({ palette }) =>
                        `1px solid ${palette.gray[20]}`,
                      pb: 0.7,
                    },
                    textDecoration: "none",
                  }}
                  target={successfullyCreated ? "_blank" : undefined}
                >
                  <Typography
                    component="label"
                    htmlFor={entity.tempUuid}
                    variant="smallTextParagraphs"
                    sx={{
                      color: ({ palette }) =>
                        status === "skipped"
                          ? palette.gray[50]
                          : palette.gray[80],
                      cursor: "pointer",
                      fontSize: 14,
                      flexGrow: 1,
                      fontStyle: status === "skipped" ? "italic" : undefined,
                      textDecoration:
                        status === "skipped" ? "line-through" : undefined,
                    }}
                  >
                    {generateEntityLabel(entity, entityType, index)}
                  </Typography>
                  {status === "pending" ? (
                    <CircularProgress variant="indeterminate" size={16} />
                  ) : // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                  status && status.includes("~") ? (
                    <ArrowUpRightIcon
                      sx={{
                        fill: ({ palette }) => palette.green[70],
                        width: 16,
                        height: 16,
                      }}
                    />
                  ) : status === "skipped" ? null : (
                    <Checkbox
                      checked={entitiesToCreate.includes(entity)}
                      id={entity.tempUuid}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setEntitiesToCreate([...entitiesToCreate, entity]);
                        } else {
                          setEntitiesToCreate(
                            entitiesToCreate.filter(
                              (option) => option.tempUuid !== entity.tempUuid,
                            ),
                          );
                        }
                      }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        );
      })}

      <Box mt={1.5}>
        {overallStatus !== "done" && (
          <Button
            disabled={
              entitiesToCreate.length < 1 || overallStatus === "pending"
            }
            size="small"
            sx={{ mr: 2 }}
            type="submit"
          >
            {overallStatus === "pending" ? "Creating..." : "Create entities"}
          </Button>
        )}
        <Button size="small" type="button" variant="tertiary" onClick={reset}>
          {overallStatus === "done" ? "Done" : "Discard"}
        </Button>
      </Box>
    </Box>
  );
};
