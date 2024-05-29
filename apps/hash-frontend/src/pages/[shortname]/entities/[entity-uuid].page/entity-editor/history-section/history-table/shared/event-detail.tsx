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
          <Box mx={1}>created with type</Box>
          <Chip type>{event.entityType.title}</Chip>
        </>
      );
    }
    case "property-update": {
      const { diff, propertyType } = event;

      switch (diff.op) {
        case "added": {
          return (
            <>
              <Chip type>{propertyType.title}</Chip> <Box mx={1}>added as</Box>
              <Chip value>{diff.added}</Chip>
            </>
          );
        }
        case "removed": {
          return (
            <>
              <Chip type>{propertyType.title}</Chip>{" "}
              <Box mx={1}>removed, was</Box>
              <Chip value>{diff.removed}</Chip>
            </>
          );
        }
        case "changed": {
          return (
            <>
              <Chip type>{propertyType.title}</Chip>{" "}
              <Box mx={1}>updated from</Box>
              <Chip value>{diff.old}</Chip>
              <Box mx={1}>to</Box>
              <Chip value>{diff.new}</Chip>
            </>
          );
        }
      }
      break;
    }
    case "type-update":
      return <span>Updated type</span>;
  }
};
