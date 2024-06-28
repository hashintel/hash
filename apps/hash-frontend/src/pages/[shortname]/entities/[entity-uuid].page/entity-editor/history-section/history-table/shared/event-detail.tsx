import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box } from "@mui/material";

import type { HistoryEvent } from "../../shared/types";
import { Chip } from "./chip";

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
          <Chip>{entityLabel}</Chip>
          <Box mx={1} sx={{ whiteSpace: "nowrap" }}>
            created with type
          </Box>
          <Chip showInFull type>
            {event.entityType.title}
          </Chip>
        </>
      );
    }
    case "property-update": {
      const { diff, propertyType } = event;

      switch (diff.op) {
        case "added": {
          return (
            <>
              <Chip showInFull type>
                {propertyType.title}
              </Chip>{" "}
              <Box mx={1} sx={{ whiteSpace: "nowrap" }}>
                added as
              </Box>
              <Chip value>{diff.added}</Chip>
            </>
          );
        }
        case "removed": {
          return (
            <>
              <Chip showInFull type>
                {propertyType.title}
              </Chip>{" "}
              <Box mx={1} sx={{ whiteSpace: "nowrap" }}>
                removed, was
              </Box>
              <Chip value>{diff.removed}</Chip>
            </>
          );
        }
        case "changed": {
          return (
            <>
              <Chip showInFull type>
                {propertyType.title}
              </Chip>{" "}
              <Box mx={1} sx={{ whiteSpace: "nowrap" }}>
                updated from
              </Box>
              <Chip value>{diff.old}</Chip>
              <Box mx={1}>to</Box>
              <Chip value>{diff.new}</Chip>
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
          <Chip showInFull type>
            {entityType.title}
          </Chip>{" "}
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
