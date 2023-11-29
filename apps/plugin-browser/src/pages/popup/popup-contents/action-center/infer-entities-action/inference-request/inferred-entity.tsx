import { EntityType } from "@blockprotocol/graph";
import {
  CaretDownSolidIcon,
  IconButton,
  LinkIcon,
} from "@hashintel/design-system";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import {
  InferEntitiesCreationFailure,
  InferEntitiesReturn,
} from "@local/hash-isomorphic-utils/temporal-types";
import { BaseUrl, Entity, EntityPropertyValue } from "@local/hash-subgraph";
import { Box, Collapse, Stack, Tooltip, Typography } from "@mui/material";

import {
  darkModeBorderColor,
  darkModeInputColor,
} from "../../../../../shared/dark-mode-values";
import { useUser } from "../../../../../shared/use-user";

// @todo consolidate this with generateEntityLabel in hash-frontend
const generateEntityLabel = (
  entityToLabel: Pick<Entity | InferEntitiesCreationFailure, "properties">,
  entityType: EntityType,
  index: number,
) => {
  const simplifiedProperties = simplifyProperties<{}>(
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

type InferredEntityProps = {
  allEntityStatuses: InferEntitiesReturn["contents"];
  expanded: boolean;
  entity: InferEntitiesReturn["contents"][number];
  entityType: EntityType;
  entityTypes: EntityType[];
  indexInType: number;
  toggleExpanded: () => void;
};

export const InferredEntity = ({
  allEntityStatuses,
  expanded,
  entity,
  entityType,
  entityTypes,
  indexInType,
  toggleExpanded,
}: InferredEntityProps) => {
  const { user } = useUser();

  const successfullyCreated = "metadata" in entity;
  const locallyUniqueId = successfullyCreated
    ? entity.metadata.recordId.entityId
    : entity.temporaryId.toString();

  const isLinkEntity = "linkData" in entity;

  const leftEntityIndex = isLinkEntity
    ? allEntityStatuses.findIndex(
        (option) =>
          "metadata" in option &&
          option.metadata.recordId.entityId === entity.linkData!.leftEntityId,
      )
    : null;

  const rightEntityIndex = isLinkEntity
    ? allEntityStatuses.findIndex(
        (option) =>
          "metadata" in option &&
          option.metadata.recordId.entityId === entity.linkData!.rightEntityId,
      )
    : null;

  const linkedEntities =
    typeof leftEntityIndex === "number" && typeof rightEntityIndex === "number"
      ? {
          left: {
            entity: allEntityStatuses[leftEntityIndex] as Entity | undefined,
            entityType: entityTypes.find(
              (type) =>
                type.$id ===
                (allEntityStatuses[leftEntityIndex] as Entity).metadata
                  .entityTypeId,
            )!,
            index: leftEntityIndex,
          },
          right: {
            entity: allEntityStatuses[rightEntityIndex] as Entity | undefined,
            entityType: entityTypes.find(
              (type) =>
                type.$id ===
                (allEntityStatuses[rightEntityIndex] as Entity).metadata
                  .entityTypeId,
            )!,
            index: rightEntityIndex,
          },
        }
      : null;

  return (
    <Stack
      key={locallyUniqueId}
      sx={{
        "&:not(:last-child)": {
          borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
          pb: 0.5,
        },
        "@media (prefers-color-scheme: dark)": {
          color: darkModeInputColor,
          "&:not(:last-child)": {
            borderBottom: `1px solid ${darkModeBorderColor}`,
          },
        },
      }}
    >
      <Tooltip title={!successfullyCreated ? entity.failureReason : ""}>
        <Box
          component={successfullyCreated ? "a" : "div"}
          href={
            successfullyCreated
              ? `${FRONTEND_ORIGIN}/@${user?.properties.shortname!}/entities/${
                  locallyUniqueId.split("~")[1]
                }`
              : undefined
          }
          sx={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            pt: 0.5,
            textDecoration: "none",
          }}
          target={successfullyCreated ? "_blank" : undefined}
        >
          <Stack direction="row" sx={{ flexGrow: 1 }}>
            <Typography
              component="label"
              htmlFor={locallyUniqueId}
              variant="smallTextParagraphs"
              sx={{
                color: ({ palette }) =>
                  successfullyCreated ? palette.gray[80] : palette.gray[50],
                cursor: "pointer",
                fontSize: 14,
                fontStyle: successfullyCreated ? undefined : "italic",
                textDecoration: successfullyCreated
                  ? undefined
                  : "line-through",
                "@media (prefers-color-scheme: dark)": {
                  color: ({ palette }) =>
                    successfullyCreated ? palette.gray[20] : palette.gray[60],
                },
              }}
            >
              {linkedEntities ? (
                <Stack direction="row" alignItems="center">
                  {linkedEntities.left.entity
                    ? generateEntityLabel(
                        linkedEntities.left.entity,
                        linkedEntities.left.entityType,
                        linkedEntities.left.index,
                      )
                    : "[Unknown]"}
                  <LinkIcon
                    sx={{
                      fontSize: 14,
                      color: ({ palette }) => palette.gray[70],
                      mx: 1,
                    }}
                  />
                  {linkedEntities.right.entity
                    ? generateEntityLabel(
                        linkedEntities.right.entity,
                        linkedEntities.right.entityType,
                        linkedEntities.right.index,
                      )
                    : "[Unknown]"}
                </Stack>
              ) : (
                generateEntityLabel(
                  /**
                   * This is necessary because the hash-graph-client return Entity type has 'object' as its properties,
                   * @todo fix OpenAPI generator to avoid these inconsistencies
                   */
                  entity as Entity,
                  entityType,
                  indexInType,
                )
              )}
            </Typography>
            {Object.keys(entity.properties).length > 0 && (
              <IconButton
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  toggleExpanded();
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
        </Box>
      </Tooltip>
      <Collapse in={expanded}>
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
                    width: 120,
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
                  {typeof value === "string"
                    ? value
                    : (value as unknown)?.toString?.() ?? "[cannot display]"}
                </Typography>
              </Stack>
            ))}
        </Stack>
        {"failureReason" in entity && (
          <Typography
            sx={{
              color: ({ palette }) => palette.red[70],
              fontSize: 13,
              mt: 0.3,
            }}
          >
            Not created: {entity.failureReason}
          </Typography>
        )}
      </Collapse>
    </Stack>
  );
};
