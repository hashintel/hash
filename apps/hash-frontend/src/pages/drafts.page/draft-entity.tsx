import { useMutation } from "@apollo/client";
import { CloseIcon } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  Entity,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { Box, buttonClasses, Typography } from "@mui/material";
import { FunctionComponent, useCallback, useMemo } from "react";

import { useGetOwnerForEntity } from "../../components/hooks/use-get-owner-for-entity";
import {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import {
  archiveEntityMutation,
  structuralQueryEntitiesQuery,
  updateEntityMutation,
} from "../../graphql/queries/knowledge/entity.queries";
import { ArrowUpRightRegularIcon } from "../../shared/icons/arrow-up-right-regular-icon";
import { CheckRegularIcon } from "../../shared/icons/check-regular-icon";
import { Button, Link } from "../../shared/ui";
import { DraftEntityProvenance } from "./draft-entity/draft-entity-provenance";
import { DraftEntityType } from "./draft-entity/draft-entity-type";
import { DraftEntityViewers } from "./draft-entity/draft-entity-viewers";
import { getDraftEntitiesQueryVariables } from "./get-draft-entities-query";

export const DraftEntity: FunctionComponent<{
  subgraph: Subgraph<EntityRootType>;
  entity: Entity;
}> = ({ entity, subgraph }) => {
  const getOwnerForEntity = useGetOwnerForEntity();

  const href = useMemo(() => {
    const { shortname } = getOwnerForEntity(entity);

    return `/@${shortname}/entities/${extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    )}`;
  }, [getOwnerForEntity, entity]);

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation, {
    refetchQueries: [
      {
        query: structuralQueryEntitiesQuery,
        variables: getDraftEntitiesQueryVariables,
      },
    ],
  });

  const handleIgnore = useCallback(() => {
    void archiveEntity({
      variables: {
        entityId: entity.metadata.recordId.entityId,
      },
    });
  }, [archiveEntity, entity]);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation, {
    refetchQueries: [
      {
        query: structuralQueryEntitiesQuery,
        variables: getDraftEntitiesQueryVariables,
      },
    ],
  });

  const handleAccept = useCallback(() => {
    void updateEntity({
      variables: {
        entityId: entity.metadata.recordId.entityId,
        updatedProperties: entity.properties,
        draft: false,
      },
    });
  }, [updateEntity, entity]);

  const label = useMemo(
    () => generateEntityLabel(subgraph, entity),
    [subgraph, entity],
  );

  return (
    <Box paddingY={4.5} paddingX={3.25}>
      <Box display="flex" justifyContent="space-between">
        {/* @todo: open in a slide-over instead of redirecting */}
        <Link
          noLinkStyle
          href={href}
          sx={{
            "&:hover > div": {
              background: ({ palette }) => palette.blue[15],
            },
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
                  top: 2,
                  marginLeft: 0.5,
                }}
              />
            </Typography>
          </Box>
        </Link>
        <Box display="flex" columnGap={1}>
          <Button
            onClick={handleIgnore}
            size="xs"
            variant="tertiary"
            startIcon={<CloseIcon />}
            sx={{
              background: ({ palette }) => palette.gray[20],
              borderColor: ({ palette }) => palette.gray[30],
              color: ({ palette }) => palette.common.black,
              [`> .${buttonClasses.startIcon} > svg`]: {
                fill: ({ palette }) => palette.common.black,
              },
              "&:hover": {
                background: ({ palette }) => palette.gray[30],
              },
            }}
          >
            Ignore
          </Button>
          <Button
            onClick={handleAccept}
            size="xs"
            variant="primary"
            startIcon={<CheckRegularIcon />}
          >
            Accept
          </Button>
        </Box>
      </Box>
      <Box marginTop={1} display="flex" justifyContent="space-between">
        <Box display="flex" alignItems="center" columnGap={2}>
          <DraftEntityType entity={entity} subgraph={subgraph} />
          <DraftEntityViewers entity={entity} />
        </Box>
        <DraftEntityProvenance entity={entity} />
      </Box>
    </Box>
  );
};
