import { useMutation } from "@apollo/client";
import { CloseIcon } from "@hashintel/design-system";
import { Entity } from "@local/hash-subgraph";
import { Box, buttonClasses } from "@mui/material";
import { FunctionComponent, useCallback } from "react";

import {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import {
  archiveEntityMutation,
  structuralQueryEntitiesQuery,
  updateEntityMutation,
} from "../../../graphql/queries/knowledge/entity.queries";
import { CheckRegularIcon } from "../../../shared/icons/check-regular-icon";
import { Button } from "../../../shared/ui";
import { getDraftEntitiesQueryVariables } from "../get-draft-entities-query";

export const DraftEntityActionButtons: FunctionComponent<{
  entity: Entity;
}> = ({ entity }) => {
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
  return (
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
  );
};
