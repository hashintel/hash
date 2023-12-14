import {
  CaretDownSolidIcon,
  IconButton,
  LinkIcon,
  PlusIcon,
} from "@hashintel/design-system";
import type { InferEntitiesReturn } from "@local/hash-isomorphic-utils/ai-inference-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  BaseUrl,
  Entity,
  EntityPropertyValue,
  EntityTypeWithMetadata,
} from "@local/hash-subgraph";
import { Box, Collapse, Stack, Typography } from "@mui/material";

import { getOwnedByIdFromEntityId } from "../../../../../../shared/get-user";
import { LocalStorage } from "../../../../../../shared/storage";
import {
  darkModeBorderColor,
  darkModeInputColor,
} from "../../../../../shared/style-values";
import { UpFromLineIcon } from "./inferred-entity/up-from-line-icon";

// @todo consolidate this with generateEntityLabel in hash-frontend
const generateEntityLabel = (
  entityToLabel: Partial<Pick<Entity, "properties">>,
  entityType: EntityTypeWithMetadata,
  index: number,
) => {
  const simplifiedProperties = simplifyProperties<{}>(
    entityToLabel.properties ?? {},
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

  return `${entityType.schema.title}-${index + 1}`;
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
  allEntityStatuses: InferEntitiesReturn["contents"][number]["results"];
  expanded: boolean;
  entityType: EntityTypeWithMetadata;
  entityTypes: EntityTypeWithMetadata[];
  indexInType: number;
  result: InferEntitiesReturn["contents"][number]["results"][number];
  toggleExpanded: () => void;
  user: NonNullable<LocalStorage["user"]>;
};

export const InferredEntity = ({
  allEntityStatuses,
  expanded,
  entityType,
  entityTypes,
  indexInType,
  result,
  toggleExpanded,
  user,
}: InferredEntityProps) => {
  const { operation, proposedEntity, status } = result;

  const persistedEntity = status === "success" ? result.entity : null;
  const wasSuccess = status === "success";

  const isLinkEntity = persistedEntity && "linkData" in persistedEntity;

  const leftEntityIndex = isLinkEntity
    ? allEntityStatuses.findIndex(
        (option) =>
          "entity" in option &&
          option.entity?.metadata.recordId.entityId ===
            persistedEntity.linkData!.leftEntityId,
      )
    : null;

  const rightEntityIndex = isLinkEntity
    ? allEntityStatuses.findIndex(
        (option) =>
          "entity" in option &&
          option.entity?.metadata.recordId.entityId ===
            persistedEntity.linkData!.rightEntityId,
      )
    : null;

  const web = !result.entity
    ? null
    : [user, ...user.orgs].find(
        (userOrOrg) =>
          userOrOrg.webOwnedById ===
          getOwnedByIdFromEntityId(result.entity!.metadata.recordId.entityId),
      );

  const linkedEntities =
    typeof leftEntityIndex === "number" && typeof rightEntityIndex === "number"
      ? {
          left: {
            entity: allEntityStatuses[leftEntityIndex]?.entity,
            entityType: entityTypes.find(
              (type) =>
                type.schema.$id ===
                allEntityStatuses[leftEntityIndex]?.entityTypeId,
            )!,
            index: leftEntityIndex,
          },
          right: {
            entity: allEntityStatuses[rightEntityIndex]?.entity,
            entityType: entityTypes.find(
              (type) =>
                type.schema.$id ===
                allEntityStatuses[rightEntityIndex]?.entityTypeId,
            )!,
            index: rightEntityIndex,
          },
        }
      : null;

  return (
    <Box
      key={result.proposedEntity.entityId.toString()}
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
      <Stack
        component={wasSuccess ? "a" : "div"}
        direction="row"
        href={
          persistedEntity
            ? /**
               * Ideally we would use {@link extractEntityUuidFromEntityId} from @local/hash-subgraph here,
               * but importing it causes WASM-related functions to end up in the bundle,
               * even when imports in that package only come from `@blockprotocol/type-system/slim`,
               * which isn't supposed to have WASM.
               *
               * @todo figure out why that is and fix it, possibly in the @blockprotocol/type-system package,
               *    or in the plugin-browser webpack config.
               */
              `${FRONTEND_ORIGIN}/@${web?.properties.shortname!}/entities/${
                persistedEntity.metadata.recordId.entityId.split("~")[1]
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
        target={persistedEntity ? "_blank" : undefined}
      >
        <Stack direction="row" alignItems="center" sx={{ flexGrow: 1 }}>
          <Typography
            component="label"
            variant="smallTextParagraphs"
            sx={{
              color: ({ palette }) =>
                wasSuccess ? palette.gray[80] : palette.gray[50],
              cursor: "pointer",
              fontSize: 14,
              fontStyle: wasSuccess ? undefined : "italic",
              textDecoration: wasSuccess ? undefined : "line-through",
              "@media (prefers-color-scheme: dark)": {
                color: ({ palette }) =>
                  wasSuccess ? palette.gray[40] : palette.gray[60],
              },
            }}
          >
            {linkedEntities ? (
              <Stack direction="row" alignItems="center">
                {linkedEntities.left.entity
                  ? generateEntityLabel(
                      linkedEntities.left.entity as Entity,
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
                      linkedEntities.right.entity as Entity,
                      linkedEntities.right.entityType,
                      linkedEntities.right.index,
                    )
                  : "[Unknown]"}
              </Stack>
            ) : (
              generateEntityLabel(
                {
                  properties: {
                    ...(persistedEntity?.properties ?? {}),
                    /**
                     * We take both the proposed entity's properties and the persisted entity's properties
                     * because the model does not reliably return all the entity's properties when suggesting an update,
                     * and one of the persisted properties may be most useful for labelling.
                     */
                    ...proposedEntity.properties,
                  },
                },
                entityType,
                indexInType,
              )
            )}
          </Typography>
          {Object.keys(proposedEntity.properties ?? {}).length > 0 && (
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
                  transform: !expanded ? "rotate(-90deg)" : "translateY(-1px)",
                  transition: ({ transitions }) =>
                    transitions.create("transform"),
                }}
              />
            </IconButton>
          )}
        </Stack>
        {status === "success" ? (
          operation === "update" ? (
            <UpFromLineIcon
              sx={{
                fill: ({ palette }) => palette.blue[60],
                fontSize: 14,
                ml: 0.5,
              }}
            />
          ) : (
            <PlusIcon
              sx={{
                fontSize: 14,
                ml: 0.5,
                color: ({ palette }) => palette.green[80],
              }}
            />
          )
        ) : null}
      </Stack>
      <Collapse in={expanded}>
        <Stack mt={0.5}>
          {Object.entries(proposedEntity.properties ?? {})
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
                    : value?.toString() ?? "[cannot display]"}
                </Typography>
              </Stack>
            ))}
        </Stack>
        {!wasSuccess && (
          <Typography
            sx={{
              color: ({ palette }) => palette.red[70],
              fontSize: 13,
              mt: 0.3,
            }}
          >
            Not {operation}d: {result.failureReason}
          </Typography>
        )}
      </Collapse>
    </Box>
  );
};
