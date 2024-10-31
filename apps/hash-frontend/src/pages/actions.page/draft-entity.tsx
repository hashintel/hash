import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Checkbox, Typography } from "@mui/material";
import type { FunctionComponent } from "react";
import { useMemo, useRef, useState } from "react";

import { useDraftEntities } from "../../shared/draft-entities-context";
import { ArrowUpRightRegularIcon } from "../../shared/icons/arrow-up-right-regular-icon";
import { Link } from "../../shared/ui";
import { EditEntitySlideOver } from "../[shortname]/entities/[entity-uuid].page/edit-entity-slide-over";
import { generateEntityRootedSubgraph } from "../shared/subgraphs";
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

  const [entityRootedSubgraph, setEntityRootedSubgraph] = useState<
    Subgraph<EntityRootType> | undefined
  >(generateEntityRootedSubgraph(entity.metadata.recordId.entityId, subgraph));

  const previouslyEvaluatedSubgraph =
    useRef<Subgraph<EntityRootType>>(subgraph);

  const previouslyEvaluatedEntity = useRef<Entity>(entity);

  /**
   * Only re-evaluate the entity rooted subgraph if the entity edition
   * has changed, as otherwise the entity editor entity selector will re-mount
   * itself clearing any text input from the user. Ideally this would not be
   * the case, and the latest version of the subgraph would become available
   * to the entity editor, so that we can do something like this:
   *
   * const entityRootedSubgraph = useMemo<Subgraph<EntityRootType>>(
   *   () => generateEntityRootedSubgraph(entity, subgraph),
   *   [subgraph, entity],
   * );
   *
   * @todo: figure out what the underlying issue is causing the `EntitySelector`
   * component to re-mount when the subgraph changes.
   */
  if (
    previouslyEvaluatedEntity.current.metadata.recordId.editionId !==
    entity.metadata.recordId.editionId
  ) {
    previouslyEvaluatedEntity.current = entity;
    previouslyEvaluatedSubgraph.current = subgraph;
    setEntityRootedSubgraph(
      generateEntityRootedSubgraph(entity.metadata.recordId.entityId, subgraph),
    );
  }

  /**
   * If the current `subgraph` has a root which is not present
   * in the previously evaluated subgraph, then we need to re-evaluate
   * the entity rooted subgraph.
   */
  if (
    subgraph.roots.some(
      (root) =>
        previouslyEvaluatedSubgraph.current.roots.find(
          (previouslyEvaluatedRoot) =>
            previouslyEvaluatedRoot.baseId === root.baseId &&
            previouslyEvaluatedRoot.revisionId === root.revisionId,
        ) === undefined,
    )
  ) {
    previouslyEvaluatedEntity.current = entity;
    previouslyEvaluatedSubgraph.current = subgraph;
    setEntityRootedSubgraph(
      generateEntityRootedSubgraph(entity.metadata.recordId.entityId, subgraph),
    );
  }

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
          {entityRootedSubgraph ? (
            <EditEntitySlideOver
              open={!!displayEntityIdInModal}
              entityId={displayEntityIdInModal ?? undefined}
              entitySubgraph={entityRootedSubgraph}
              onClose={() => setDisplayEntityIdInModal(null)}
              onEntityClick={(entityId) => setDisplayEntityIdInModal(entityId)}
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
