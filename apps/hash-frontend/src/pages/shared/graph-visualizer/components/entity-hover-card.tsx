import { Box, Divider, Stack, Typography } from "@mui/material";
import { keyframes } from "@mui/system";
import { memo, useMemo } from "react";

import { EntityOrTypeIcon } from "@hashintel/design-system";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";

import { Button } from "../../../../shared/ui/button";

import type { Position } from "../geometry";
import type {
  BaseUrl,
  ClosedMultiEntityType,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

/** How many salient properties the card shows before it gets noisy. */
const MAX_PROPERTIES = 4;

interface EntityHoverCardProps extends Position {
  readonly entity: HashEntity;
  readonly closedMultiEntityTypesRootMap:
    | ClosedMultiEntityTypesRootMap
    | undefined;
  readonly definitions: ClosedMultiEntityTypesDefinitions | undefined;
  /** Incident-link count (needs the full entity set, so the bridge resolves it). */
  readonly degree: number;
  /**
   * When set, the card is "pinned" (a selection, not a hover): it renders an Open action
   * that calls this. The card body stays click-through; only this button is interactive.
   * Must be referentially stable across pans, or the memoized body re-renders every frame.
   */
  readonly onOpen?: () => void;
}

/** A short, single-line rendering of a property value. */
function formatPropertyValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatPropertyValue(item)).join(", ");
  }
  if (typeof value === "string") {
    return value.length > 64 ? `${value.slice(0, 63)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "…";
}

const rise = keyframes`
  from { opacity: 0; transform: translateY(3px); }
  to   { opacity: 1; transform: translateY(0); }
`;

type EntityHoverCardBodyProps = Omit<EntityHoverCardProps, "x" | "y">;

/**
 * The card's visual body. Memoized on the entity + type context (not the position), so a pan
 * that moves the card every frame only updates the wrapper's transform -- this MUI tree (label,
 * type, properties, footer) is laid out once per entity, never re-rendered per frame. For that
 * to hold, every prop here must be referentially stable while the selection is unchanged.
 */
const EntityHoverCardBodyComponent = ({
  entity,
  closedMultiEntityTypesRootMap,
  definitions,
  degree,
  onOpen,
}: EntityHoverCardBodyProps) => {
  // Resolve everything from the entity + type context, keyed on the entity so a cursor move
  // over the same dot reuses it (the position rides x/y separately).
  const content = useMemo(() => {
    if (!closedMultiEntityTypesRootMap) {
      return null;
    }

    let closedType: ClosedMultiEntityType;
    try {
      closedType = getClosedMultiEntityTypeFromMap(
        closedMultiEntityTypesRootMap,
        entity.metadata.entityTypeIds,
      );
    } catch {
      return null;
    }

    const { icon, isLink, labelProperty } =
      getDisplayFieldsForClosedEntityType(closedType);

    const properties: { title: string; value: string }[] = [];
    for (const [baseUrl, raw] of Object.entries(entity.properties)) {
      if (baseUrl === labelProperty || raw === null) {
        continue;
      }

      const refSchema = closedType.properties[baseUrl as BaseUrl];
      if (!refSchema) {
        continue;
      }

      const propertyTypeId =
        "$ref" in refSchema ? refSchema.$ref : refSchema.items.$ref;

      const title = definitions?.propertyTypes[propertyTypeId]?.title;
      const value = formatPropertyValue(raw);
      if (!title || value === "") {
        continue;
      }
      properties.push({ title, value });
      if (properties.length >= MAX_PROPERTIES) {
        break;
      }
    }

    const createdIso = entity.metadata.provenance.createdAtDecisionTime;
    const createdDate = createdIso ? new Date(createdIso) : undefined;
    const created =
      createdDate && !Number.isNaN(createdDate.getTime())
        ? createdDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : undefined;

    return {
      label: generateEntityLabel(closedType, entity),
      typeTitle: closedType.allOf[0].title,
      icon,
      isLink,
      properties,
      created,
    };
  }, [entity, closedMultiEntityTypesRootMap, definitions]);

  if (!content) {
    return null;
  }

  // A link entity's "degree" (links pointing AT the link) is ~always 0 and only confuses, so
  // the link count is shown for nodes only.
  const hasFooter =
    (degree > 0 && !content.isLink) || content.created !== undefined;

  return (
    <Box
      sx={({ palette, boxShadows }) => ({
        position: "relative",
        minWidth: 208,
        maxWidth: 300,
        bgcolor: onOpen ? palette.blue[10] : palette.common.white,
        border: `1px solid ${onOpen ? palette.blue[30] : palette.gray[20]}`,
        borderRadius: "8px",
        boxShadow: boxShadows.md,
        animation: `${rise} 130ms cubic-bezier(0.22, 1, 0.36, 1)`,
        "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      })}
    >
      {/* Identity: type icon anchors the name + type, so they read as one block. */}
      <Box
        sx={{
          px: 1.75,
          pt: 1.5,
          pb: 1.25,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
        }}
      >
        <Box
          sx={({ palette }) => ({
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: "7px",
            bgcolor: palette.gray[10],
            border: `1px solid ${palette.gray[20]}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          })}
        >
          <EntityOrTypeIcon
            entity={null}
            icon={content.icon}
            isLink={content.isLink}
            fontSize={17}
            fill={({ palette }) => palette.gray[70]}
          />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="smallTextLabels"
            sx={{
              display: "block",
              fontWeight: 600,
              lineHeight: 1.2,
              color: ({ palette }) => palette.gray[90],
              wordBreak: "break-word",
            }}
          >
            {content.label}
          </Typography>
          <Typography
            variant="microText"
            sx={{
              display: "block",
              mt: 0.25,
              color: ({ palette }) => palette.gray[70],
            }}
          >
            {content.typeTitle}
          </Typography>
        </Box>
      </Box>

      {content.properties.length > 0 && (
        <>
          <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />
          <Stack sx={{ px: 1.75, py: 1.25, gap: 0.75 }}>
            {content.properties.map((property) => (
              <Box
                key={property.title}
                sx={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 1.5,
                }}
              >
                <Typography
                  variant="microText"
                  sx={{
                    flexShrink: 0,
                    color: ({ palette }) => palette.gray[70],
                  }}
                >
                  {property.title}
                </Typography>
                <Typography
                  variant="microText"
                  sx={{
                    minWidth: 0,
                    fontWeight: 500,
                    textAlign: "right",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: ({ palette }) => palette.gray[90],
                  }}
                >
                  {property.value}
                </Typography>
              </Box>
            ))}
          </Stack>
        </>
      )}

      {hasFooter && (
        <>
          <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />
          <Box
            sx={{
              px: 1.75,
              py: 1,
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 1.5,
            }}
          >
            {!content.isLink && (
              <Typography
                variant="microText"
                sx={{ color: ({ palette }) => palette.gray[70] }}
              >
                {degree} {degree === 1 ? "link" : "links"}
              </Typography>
            )}
            {content.created !== undefined && (
              <Typography
                variant="microText"
                sx={{ color: ({ palette }) => palette.gray[70] }}
              >
                {content.created}
              </Typography>
            )}
          </Box>
        </>
      )}

      {onOpen ? (
        <>
          <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />
          <Button
            variant="primary"
            size="xs"
            fullWidth
            onClick={onOpen}
            // The wrapper is click-through (pointerEvents: none) so it never eats a hover/pan
            // on the canvas; the one interactive control opts back in.
            sx={{
              pointerEvents: "auto",
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
            }}
          >
            Open
          </Button>
        </>
      ) : null}
    </Box>
  );
};

const EntityHoverCardBody = memo(EntityHoverCardBodyComponent);

/**
 * Hover / selection card for an entity dot. Owns how an entity is presented (label, type, a few
 * key properties, a creation date) in the hash-frontend design language. The wrapper positions
 * the card via a GPU transform -- cheap to update every pan frame -- while {@link
 * EntityHoverCardBody} renders the contents, memoized so that per-frame move never re-lays them
 * out. Click-through (pointer-events disabled) except the Open button, so it never eats hovers.
 */
export const EntityHoverCard = ({
  entity,
  closedMultiEntityTypesRootMap,
  definitions,
  degree,
  x,
  y,
  onOpen,
}: EntityHoverCardProps) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      transform: `translate3d(${x + 14}px, ${y + 14}px, 0)`,
      pointerEvents: "none",
      zIndex: 10,
      willChange: "transform",
    }}
  >
    <EntityHoverCardBody
      entity={entity}
      closedMultiEntityTypesRootMap={closedMultiEntityTypesRootMap}
      definitions={definitions}
      degree={degree}
      onOpen={onOpen}
    />
  </div>
);
