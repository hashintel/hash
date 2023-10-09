import { EntityPropertyValue, EntityType } from "@blockprotocol/graph";
import {
  ArrowUpRightIcon,
  Button,
  CaretDownSolidIcon,
  IconButton,
} from "@hashintel/design-system";
import { ProposedEntity } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  Simplified,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import { User } from "@local/hash-isomorphic-utils/system-types/shared";
import { BaseUrl, EntityId, OwnedById } from "@local/hash-subgraph";
import {
  Box,
  Checkbox,
  CircularProgress,
  Collapse,
  Stack,
  Typography,
} from "@mui/material";
import pluralize from "pluralize";
import { useMemo, useState } from "react";

import {
  darkModeBorderColor,
  darkModeInputColor,
} from "../../../../shared/dark-mode-values";
import { sendMessageToBackground } from "../../../../shared/messages";
import { useSessionStorage } from "../../../../shared/use-storage-sync";

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

// This assumes a hash.ai/blockprotocol.org type URL format ending in [slugified-title]/
const baseUrlToPropertyTitle = (baseUrl: BaseUrl) =>
  baseUrl
    .split("/")
    .slice(-2, -1)[0]
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

type CreateInferredEntitiesProps = {
  inferredEntities: ProposedEntity[];
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
  const [entitiesToCreate, setEntitiesToCreate] = useSessionStorage(
    "entitiesToCreate",
    [],
  );
  const [creationStatus] = useSessionStorage("creationStatus", {
    overallStatus: "not-started",
    entityStatuses: {},
  });

  const [entitiesToExpand, setEntitiesToExpand] = useState<
    Record<EntityId, boolean | undefined>
  >({});

  const inferredEntitiesByType = useMemo(() => {
    return targetEntityTypes.reduce(
      (acc, type) => {
        acc[type.$id] = inferredEntities.filter(
          (entity) => entity.entityTypeId === type.$id,
        );
        return acc;
      },
      {} as Record<string, ProposedEntity[]>,
    );
  }, [inferredEntities, targetEntityTypes]);

  const createEntities = () => {
    setEntitiesToExpand({});

    const skippedEntities: ProposedEntity[] = [];
    for (const entity of inferredEntities) {
      if (
        !entitiesToCreate.some((option) => option.entityId === entity.entityId)
      ) {
        skippedEntities.push(entity);
      }
    }

    void sendMessageToBackground({
      type: "create-entities",
      entitiesToCreate,
      skippedEntities,
      // @todo figure out why extractOwnedByIdFromEntityId has WASM in its evaluation path
      ownedById: user.metadata.recordId.entityId.split("~")[1] as OwnedById,
    });
  };

  const { entityStatuses, overallStatus } = creationStatus;

  return (
    <Box
      component="form"
      onSubmit={(event) => {
        if (overallStatus === "pending") {
          return;
        }
        event.preventDefault();
        createEntities();
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
              borderRadius: 2,
              border: `1px solid ${palette.gray[20]}`,
              boxShadow: boxShadows.xs,
              mb: 2,
              p: 2,
              "@media (prefers-color-scheme: dark)": {
                borderColor: palette.gray[90],
              },
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
              const status = entityStatuses[entity.entityId];

              const successfullyCreated = status?.includes("~");

              const expanded = entitiesToExpand[entity.entityId];

              return (
                <Stack
                  key={entity.entityId}
                  sx={{
                    "&:not(:last-child)": {
                      borderBottom: ({ palette }) =>
                        `1px solid ${palette.gray[20]}`,
                      pb: 0.7,
                    },
                    "@media (prefers-color-scheme: dark)": {
                      color: darkModeInputColor,
                      "&:not(:last-child)": {
                        borderBottom: `1px solid ${darkModeBorderColor}`,
                      },
                    },
                  }}
                >
                  <Box
                    component={successfullyCreated ? "a" : "div"}
                    href={
                      successfullyCreated
                        ? `${FRONTEND_ORIGIN}/@${user.properties
                            .shortname!}/entities/${status!.split("~")[1]}`
                        : undefined
                    }
                    sx={{
                      alignItems: "center",
                      display: "flex",
                      justifyContent: "space-between",
                      pt: 0.7,
                      textDecoration: "none",
                    }}
                    target={successfullyCreated ? "_blank" : undefined}
                  >
                    <Stack direction="row" sx={{ flexGrow: 1 }}>
                      <Typography
                        component="label"
                        htmlFor={entity.entityId}
                        variant="smallTextParagraphs"
                        sx={{
                          color: ({ palette }) =>
                            status === "skipped"
                              ? palette.gray[50]
                              : palette.gray[80],
                          cursor: "pointer",
                          fontSize: 14,
                          fontStyle:
                            status === "skipped" ? "italic" : undefined,
                          textDecoration:
                            status === "skipped" ? "line-through" : undefined,
                          "@media (prefers-color-scheme: dark)": {
                            color: ({ palette }) =>
                              status === "skipped"
                                ? palette.gray[60]
                                : palette.gray[20],
                          },
                        }}
                      >
                        {generateEntityLabel(entity, entityType, index)}
                      </Typography>
                      {overallStatus === "not-started" && (
                        <IconButton
                          onClick={(event) => {
                            event.stopPropagation();
                            setEntitiesToExpand((expansionStatuses) => {
                              return {
                                ...expansionStatuses,
                                [entity.entityId]:
                                  !expansionStatuses[entity.entityId],
                              };
                            });
                          }}
                          sx={({ palette }) => ({
                            p: 0.5,
                            "&:hover": {
                              background: "none",

                              "@media (prefers-color-scheme: dark)": {
                                color: palette.primary.main,
                              },
                            },
                          })}
                        >
                          <CaretDownSolidIcon
                            sx={{
                              height: 14,
                              transform: !expanded
                                ? "rotate(-90deg)"
                                : "translateY(-1px)",
                              transition: ({ transitions }) =>
                                transitions.create("transform"),
                            }}
                          />
                        </IconButton>
                      )}
                    </Stack>
                    {status === "pending" ? (
                      <CircularProgress variant="indeterminate" size={16} />
                    ) : successfullyCreated ? (
                      <ArrowUpRightIcon
                        sx={{
                          fill: ({ palette }) => palette.green[70],
                          width: 16,
                          height: 16,
                        }}
                      />
                    ) : status === "skipped" ? null : (
                      <Checkbox
                        checked={entitiesToCreate.some(
                          (option) => option.entityId === entity.entityId,
                        )}
                        id={entity.entityId}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setEntitiesToCreate([...entitiesToCreate, entity]);
                          } else {
                            setEntitiesToCreate(
                              entitiesToCreate.filter(
                                (option) => option.entityId !== entity.entityId,
                              ),
                            );
                          }
                        }}
                      />
                    )}
                  </Box>
                  <Collapse in={entitiesToExpand[entity.entityId]}>
                    <Stack mt={0.5}>
                      {Object.entries(entity.properties)
                        .sort((a, b) => a[0].localeCompare(b[0]))
                        .map(([key, value]) => (
                          <Stack
                            direction="row"
                            key={key}
                            sx={{ "&:not(:last-child)": { mb: 0.5 } }}
                          >
                            <Typography
                              sx={{
                                fontSize: 13,
                                fontWeight: 600,
                                mr: 0.5,
                                width: 90,
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                              }}
                            >
                              {baseUrlToPropertyTitle(key as BaseUrl)}:
                            </Typography>
                            <Typography
                              sx={{
                                display: "-webkit-box",
                                "-webkit-line-clamp": "3",
                                "-webkit-box-orient": "vertical",
                                fontSize: 13,
                                opacity: 0.8,
                                overflow: "hidden",
                                width: "calc(100% - 100px)",
                              }}
                            >
                              {value?.toString()}
                            </Typography>
                          </Stack>
                        ))}
                    </Stack>
                  </Collapse>
                </Stack>
              );
            })}
          </Box>
        );
      })}

      <Box mt={1.5}>
        {overallStatus !== "complete" && (
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
          {overallStatus === "complete" ? "Done" : "Discard"}
        </Button>
      </Box>
    </Box>
  );
};
