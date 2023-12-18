import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  Entity,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { Box, Typography } from "@mui/material";
import { FunctionComponent, useMemo, useRef, useState } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import { useDraftEntities } from "../../shared/draft-entities-context";
import { ArrowUpRightRegularIcon } from "../../shared/icons/arrow-up-right-regular-icon";
import { Link } from "../../shared/ui";
import { EditEntityModal } from "../[shortname]/entities/[entity-uuid].page/edit-entity-modal";
import { DraftEntityActionButtons } from "./draft-entity/draft-entity-action-buttons";
import { DraftEntityProvenance } from "./draft-entity/draft-entity-provenance";
import { DraftEntityType } from "./draft-entity/draft-entity-type";
import { DraftEntityViewers } from "./draft-entity/draft-entity-viewers";

const generateEntityRootedSubgraph = (
  entity: Entity,
  subgraph: Subgraph<EntityRootType>,
) => {
  const entityRoot = subgraph.roots.find(
    ({ baseId }) => baseId === entity.metadata.recordId.entityId,
  )!;

  return {
    ...subgraph,
    roots: [entityRoot],
  };
};

export const DraftEntity: FunctionComponent<{
  subgraph: Subgraph<EntityRootType>;
  entity: Entity;
  createdAt: Date;
}> = ({ entity, subgraph, createdAt }) => {
  const { refetch } = useDraftEntities();

  const getOwnerForEntity = useGetOwnerForEntity();

  const [displayEntityModal, setDisplayEntityModal] = useState<boolean>(false);

  const href = useMemo(() => {
    const { shortname } = getOwnerForEntity(entity);

    return `/@${shortname}/entities/${extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    )}`;
  }, [getOwnerForEntity, entity]);

  const label = useMemo(
    () => generateEntityLabel(subgraph, entity),
    [subgraph, entity],
  );

  const [entityRootedSubgraph, setEntityRootedSubgraph] = useState<
    Subgraph<EntityRootType>
  >(generateEntityRootedSubgraph(entity, subgraph));

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
    setEntityRootedSubgraph(generateEntityRootedSubgraph(entity, subgraph));
  }

  return (
    <Box paddingY={4.5} paddingX={3.25}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="flex-start"
      >
        <EditEntityModal
          open={displayEntityModal}
          entitySubgraph={entityRootedSubgraph}
          onClose={() => setDisplayEntityModal(false)}
          onSubmit={() => {
            void refetch();
            setDisplayEntityModal(false);
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
            setDisplayEntityModal(true);
            event.preventDefault();
          }}
        >
          <Box
            sx={{
              transition: ({ transitions }) => transitions.create("background"),
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
        <DraftEntityActionButtons entity={entity} subgraph={subgraph} />
      </Box>
      <Box marginTop={1.5} display="flex" justifyContent="space-between">
        <Box display="flex" alignItems="center" columnGap={2}>
          <DraftEntityType entity={entity} subgraph={subgraph} />
          <DraftEntityViewers entity={entity} />
        </Box>
        <DraftEntityProvenance entity={entity} createdAt={createdAt} />
      </Box>
    </Box>
  );
};
