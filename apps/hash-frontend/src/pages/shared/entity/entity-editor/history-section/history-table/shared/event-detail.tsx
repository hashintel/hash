import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import {
  isValueMetadata,
  type PropertyMetadata,
  type PropertyValue,
} from "@blockprotocol/type-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import { Box } from "@mui/material";

import { ValueChip } from "../../../../../value-chip";
import type { HistoryEvent } from "../../shared/types";

const createValueText = (value: PropertyValue, metadata: PropertyMetadata) => {
  if (isValueMetadata(metadata)) {
    return stringifyPropertyValue(value);
  }

  if (Array.isArray(value)) {
    return `list of ${value.length} items`;
  }

  if (typeof value === "object" && value !== null) {
    return `object with ${Object.keys(value).length} properties`;
  }

  return stringifyPropertyValue(value);
};

export const EventDetail = ({
  event,
  subgraph,
}: {
  event: HistoryEvent;
  subgraph: Subgraph;
}) => {
  switch (event.type) {
    case "created": {
      const entityLabel = generateEntityLabel(
        subgraph as Subgraph<EntityRootType>,
        event.entity,
      );
      return (
        <>
          <ValueChip>{entityLabel}</ValueChip>
          <Box mx={1} sx={{ whiteSpace: "nowrap" }}>
            created with {event.entityTypes.length === 1 ? "type" : "types"}
          </Box>
          {event.entityTypes.map((entityType) => (
            <ValueChip key={entityType.title} showInFull type>
              {entityType.title}
            </ValueChip>
          ))}
        </>
      );
    }
    case "property-update": {
      const { diff, propertyType, metadata } = event;

      switch (diff.op) {
        case "added": {
          return (
            <>
              <ValueChip showInFull type>
                {propertyType.title}
              </ValueChip>{" "}
              <Box mx={1} sx={{ whiteSpace: "nowrap" }}>
                added as
              </Box>
              <ValueChip tooltip={stringifyPropertyValue(diff.added)}>
                {createValueText(diff.added, metadata)}
              </ValueChip>
            </>
          );
        }
        case "removed": {
          return (
            <>
              <ValueChip showInFull type>
                {propertyType.title}
              </ValueChip>{" "}
              <Box mx={1} sx={{ whiteSpace: "nowrap" }}>
                removed, was
              </Box>
              <ValueChip tooltip={stringifyPropertyValue(diff.removed)}>
                {createValueText(diff.removed, metadata)}
              </ValueChip>
            </>
          );
        }
        case "changed": {
          return (
            <>
              <ValueChip showInFull type>
                {propertyType.title}
              </ValueChip>{" "}
              <Box mx={1} sx={{ whiteSpace: "nowrap" }}>
                updated from
              </Box>
              <ValueChip tooltip={stringifyPropertyValue(diff.old)}>
                {createValueText(diff.old, metadata)}
              </ValueChip>
              <Box mx={1}>to</Box>
              <ValueChip tooltip={stringifyPropertyValue(diff.new)}>
                {createValueText(diff.new, metadata)}
              </ValueChip>
            </>
          );
        }
      }
      break;
    }
    case "type-update": {
      const { entityType } = event;
      return (
        <>
          <ValueChip showInFull type>
            {entityType.title}
          </ValueChip>
          <Box ml={1} sx={{ whiteSpace: "nowrap" }}>
            type {event.op}
          </Box>
          {event.op === "upgraded" && (
            <Box ml={0.5}>
              from v{entityType.oldVersion?.toString()} to v
              {entityType.version.toString()}
            </Box>
          )}
        </>
      );
    }
    case "draft-status-change":
      return (
        <span>
          {event.newDraftStatus
            ? "Edition created as draft"
            : "Live edition created from draft"}
        </span>
      );
    case "archive-status-change":
      return (
        <span>
          {event.newArchiveStatus ? "Entity archived" : "Entity unarchived"}
        </span>
      );
    default: {
      throw new Error("Unhandled history event type");
    }
  }
};
