import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import {
  getClosedMultiEntityTypeFromMap,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { Box, Checkbox, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo } from "react";

import { ArrowUpRightRegularIcon } from "../../shared/icons/arrow-up-right-regular-icon";
import { Link } from "../../shared/ui";
import { useSlideStack } from "../shared/slide-stack";
import { useEntityHref } from "../shared/use-entity-href";
import type { EntityTypeDisplayInfoByBaseUrl } from "./draft-entities/types";
import { useDraftEntities } from "./draft-entities-context";
import { DraftEntityActionButtons } from "./draft-entity/draft-entity-action-buttons";
import { DraftEntityProvenance } from "./draft-entity/draft-entity-provenance";
import { DraftEntityType } from "./draft-entity/draft-entity-type";
import { DraftEntityWeb } from "./draft-entity/draft-entity-web";

export const DraftEntity: FunctionComponent<{
  closedMultiEntityTypesRootMap?: ClosedMultiEntityTypesRootMap;
  entity: HashEntity;
  entityTypeDisplayInfoByBaseUrl: EntityTypeDisplayInfoByBaseUrl;
  subgraph: Subgraph<EntityRootType<HashEntity>>;
  selected: boolean;
  toggleSelected: () => void;
}> = ({
  closedMultiEntityTypesRootMap,
  entity,
  entityTypeDisplayInfoByBaseUrl,
  subgraph,
  selected,
  toggleSelected,
}) => {
  const { refetch } = useDraftEntities();

  const { pushToSlideStack } = useSlideStack();

  const href = useEntityHref(entity, true);

  const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
    closedMultiEntityTypesRootMap,
    entity.metadata.entityTypeIds,
  );

  const label = useMemo(
    () => generateEntityLabel(closedMultiEntityType, entity),
    [closedMultiEntityType, entity],
  );

  return (
    <Box paddingRight={4.5} paddingLeft={6} paddingY={3.25}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <Box display="flex" alignItems="center">
          <Checkbox
            checked={selected}
            onChange={toggleSelected}
            sx={{
              position: "relative",
              top: 2,
              svg: {
                width: 18,
                height: 18,
              },
              marginLeft: ({ spacing }) =>
                `calc(-1 * (18px + ${spacing(1.5)}))`,
              paddingRight: 1.5,
            }}
          />
          <Link
            noLinkStyle
            href={href}
            sx={{
              "&:hover > div": {
                background: ({ palette }) => palette.blue[15],
              },
            }}
            onClick={(event) => {
              if (event.metaKey) {
                return;
              }

              event.preventDefault();
              pushToSlideStack({
                kind: "entity",
                itemId: entity.metadata.recordId.entityId,
                onEntityDbChange: () => {
                  void refetch();
                },
              });
            }}
          >
            <Box
              sx={{
                transition: ({ transitions }) =>
                  transitions.create("background"),
                borderRadius: "6px",
                paddingY: 0.5,
                paddingX: 1,
                marginLeft: -1,
              }}
            >
              <Typography
                variant="h2"
                sx={{
                  fontSize: 24,
                  fontWeight: 600,
                  color: ({ palette }) => palette.gray[90],
                }}
              >
                {label}
                <ArrowUpRightRegularIcon
                  sx={{
                    color: ({ palette }) => palette.blue[70],
                    position: "relative",
                    top: 5,
                    marginLeft: 0.5,
                  }}
                />
              </Typography>
            </Box>
          </Link>
        </Box>

        <DraftEntityActionButtons
          closedMultiEntityType={closedMultiEntityType}
          entity={entity}
          subgraph={subgraph}
        />
      </Box>
      <Box marginTop={1.5} display="flex" justifyContent="space-between">
        <Box display="flex" alignItems="center" columnGap={2}>
          <DraftEntityType
            entity={entity}
            entityTypeDisplayInfoByBaseUrl={entityTypeDisplayInfoByBaseUrl}
          />
          <DraftEntityWeb entity={entity} />
          {/*
           * @todo: bring back draft entity viewers when the GQL resolver
           * returns the correct number of authorization relationships.
           *
           * @see https://linear.app/hash/issue/H-1115/use-permission-types-from-graph-in-graphql
           */}
          {/* <DraftEntityViewers entity={entity} /> */}
        </Box>
        <DraftEntityProvenance entity={entity} />
      </Box>
    </Box>
  );
};
