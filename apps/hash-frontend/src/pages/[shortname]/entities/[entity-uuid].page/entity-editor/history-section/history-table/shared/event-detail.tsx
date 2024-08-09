import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box } from "@mui/material";

import { ValueChip } from "../../../../../../../shared/value-chip";
import type { HistoryEvent } from "../../shared/types";
import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";

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
            created with type
          </Box>
          <ValueChip showInFull type>
            {event.entityType.title}
          </ValueChip>
        </>
      );
    }
    case "property-update": {
      const { diff, propertyType } = event;

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
              <ValueChip tooltip={diff.added}>
                {stringifyPropertyValue(diff.added)}
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
              <ValueChip>{stringifyPropertyValue(diff.removed)}</ValueChip>
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
              <ValueChip>{stringifyPropertyValue(diff.old)}</ValueChip>
              <Box mx={1}>to</Box>
              <ValueChip>{stringifyPropertyValue(diff.new)}</ValueChip>
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
              from v{entityType.oldVersion} to v{entityType.version}
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
    default: {
      throw new Error("Unhandled history event type");
    }
  }
};
