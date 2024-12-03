import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Checkbox, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo, useState } from "react";

import { useDraftEntities } from "../../shared/draft-entities-context";
import { ArrowUpRightRegularIcon } from "../../shared/icons/arrow-up-right-regular-icon";
import { Link } from "../../shared/ui";
import { EntityEditorSlideStack } from "../shared/entity-editor-slide-stack";
import { useEntityHref } from "../shared/use-entity-href";
import { DraftEntityActionButtons } from "./draft-entity/draft-entity-action-buttons";
import { DraftEntityProvenance } from "./draft-entity/draft-entity-provenance";
import { DraftEntityType } from "./draft-entity/draft-entity-type";
import { DraftEntityWeb } from "./draft-entity/draft-entity-web";

export const DraftEntity: FunctionComponent<{
  subgraph: Subgraph<EntityRootType>;
  entity: Entity;
  selected: boolean;
  toggleSelected: () => void;
}> = ({ entity, subgraph, selected, toggleSelected }) => {
  const { refetch } = useDraftEntities();

  const [displayEntityIdInModal, setDisplayEntityIdInModal] =
    useState<EntityId | null>(null);

  const href = useEntityHref(entity, true);

  const label = useMemo(
    () => generateEntityLabel(subgraph, entity),
    [subgraph, entity],
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
          {displayEntityIdInModal ? (
            <EntityEditorSlideStack
              rootEntityId={displayEntityIdInModal}
              onClose={() => setDisplayEntityIdInModal(null)}
              onSubmit={() => {
                void refetch();
                setDisplayEntityIdInModal(null);
              }}
              readonly={
                displayEntityIdInModal !== entity.metadata.recordId.entityId
              }
            />
          ) : null}
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
              setDisplayEntityIdInModal(entity.metadata.recordId.entityId);
              event.preventDefault();
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
        <DraftEntityActionButtons entity={entity} subgraph={subgraph} />
      </Box>
      <Box marginTop={1.5} display="flex" justifyContent="space-between">
        <Box display="flex" alignItems="center" columnGap={2}>
          <DraftEntityType entity={entity} subgraph={subgraph} />
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
