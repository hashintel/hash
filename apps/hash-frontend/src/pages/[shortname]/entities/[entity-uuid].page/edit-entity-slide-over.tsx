import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@apollo/client";
import { ArrowUpRightRegularIcon } from "@hashintel/design-system";
import {
  mergePropertyObjectAndMetadata,
  patchesFromPropertyObjects,
} from "@local/hash-graph-sdk/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type {
  EntityRootType,
  extractOwnedByIdFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Drawer, Stack, Typography } from "@mui/material";

import { useUserOrOrgShortnameByOwnedById } from "../../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { Button, Link } from "../../../../shared/ui";

import { EntityEditor } from "./entity-editor";
import { updateEntitySubgraphStateByEntity } from "./shared/update-entity-subgraph-state-by-entity";
import { useApplyDraftLinkEntityChanges } from "./shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./shared/use-draft-link-state";

interface EditEntitySlideOverProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  readonly?: boolean;
  entitySubgraph: Subgraph<EntityRootType>;
}

/**
 * @todo Move this to a shared location (it's also used in the Flows output and draft entities views).
 */
export const EditEntitySlideOver = ({
  open,
  onClose,
  onSubmit,
  readonly = false,
  entitySubgraph,
}: EditEntitySlideOverProps) => {
  const [localEntitySubgraph, setLocalEntitySubgraph] =
    useState<Subgraph<EntityRootType>>(entitySubgraph);

  const [savingChanges, setSavingChanges] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [previousOpen, setPreviousOpen] = useState(open);

  if (previousOpen !== open) {
    setPreviousOpen(open);

    // reset state before opening modal
    if (open) {
      setSavingChanges(false);
      setIsDirty(false);
      setLocalEntitySubgraph(entitySubgraph);
    }
  }

  const [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] = useDraftLinkState();
  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const entityLabel = useMemo(
    () => generateEntityLabel(localEntitySubgraph),
    [localEntitySubgraph],
  );

  const resetEntityEditor = useCallback(() => {
    setDraftLinksToCreate([]);
    setDraftLinksToArchive([]);
    setIsDirty(false);
  }, [setDraftLinksToCreate, setDraftLinksToArchive, setIsDirty]);

  const handleCancel = useCallback(() => {
    resetEntityEditor();
    onClose();
  }, [onClose, resetEntityEditor]);

  const entity = getRoots(localEntitySubgraph)[0];

  if (!entity) {
    throw new Error(`No root in entity subgraph`);
  }

  const ownedById = extractOwnedByIdFromEntityId(
    entity.metadata.recordId.entityId,
  );

  const { shortname: entityOwningShortname } = useUserOrOrgShortnameByOwnedById(
    { ownedById },
  );

  const handleSaveChanges = useCallback(async () => {
    const draftEntity = getRoots(localEntitySubgraph)[0];
    const oldEntity = getRoots(entitySubgraph)[0];

    if (!oldEntity) {
      throw new Error(`No entity provided in entitySubgraph`);
    }

    if (!draftEntity) {
      return;
    }

    try {
      setSavingChanges(true);

      await applyDraftLinkEntityChanges(
        draftEntity,
        draftLinksToCreate,
        draftLinksToArchive,
      );

      /** @todo Add validation here */
      const updateEntityResponse = await updateEntity({
        variables: {
          entityUpdate: {
            entityId: draftEntity.metadata.recordId.entityId,
            propertyPatches: patchesFromPropertyObjects({
              oldProperties: oldEntity.properties,
              newProperties: mergePropertyObjectAndMetadata(
                draftEntity.properties,
                undefined,
              ),
            }),
            entityTypeId: draftEntity.metadata.entityTypeId,
          },
        },
      });

      if (!updateEntityResponse.data) {
        throw new Error("Updating entity failed");
      }

      resetEntityEditor();
      onSubmit();
    } catch (error) {
      setSavingChanges(false);
    }
  }, [
    applyDraftLinkEntityChanges,
    draftLinksToArchive,
    draftLinksToCreate,
    entitySubgraph,
    localEntitySubgraph,
    onSubmit,
    resetEntityEditor,
    updateEntity,
  ]);

  const submitDisabled =
    !isDirty &&
    draftLinksToCreate.length === 0 &&
    draftLinksToArchive.length === 0;

  return (
    <Drawer
      open={open}
      anchor={"right"}
      PaperProps={{
        sx: (theme) => ({
          p: 5,
          gap: 6.5,
          maxWidth: 1200,
          width: "calc(100vw - 200px)",
          [theme.breakpoints.down("md")]: {
            width: "100%",
          },
        }),
      }}
      onClose={onClose}
    >
      <Stack alignItems={"center"} direction={"row"}>
        <Typography variant={"h2"} color={"gray.90"} fontWeight={"bold"}>
          {entityLabel}
        </Typography>
        {entityOwningShortname && (
          <Link
            target={"_blank"}
            href={generateEntityPath({
              shortname: entityOwningShortname,
              entityId: entity.metadata.recordId.entityId,
              includeDraftId: true,
            })}
          >
            <ArrowUpRightRegularIcon
              sx={{
                fill: ({ palette }) => palette.blue[70],
                fontSize: 20,
                ml: 0.8,
              }}
            />
          </Link>
        )}
      </Stack>

      <EntityEditor
        readonly={readonly}
        entitySubgraph={localEntitySubgraph}
        isDirty={isDirty}
        draftLinksToCreate={draftLinksToCreate}
        setDraftLinksToCreate={setDraftLinksToCreate}
        draftLinksToArchive={draftLinksToArchive}
        setDraftLinksToArchive={setDraftLinksToArchive}
        setEntity={(newEntity) => {
          setIsDirty(true);
          updateEntitySubgraphStateByEntity(
            newEntity,
            (updatedEntitySubgraphOrFunction) => {
              setLocalEntitySubgraph((previous) => {
                const updatedEntitySubgraph =
                  typeof updatedEntitySubgraphOrFunction === "function"
                    ? updatedEntitySubgraphOrFunction(previous)
                    : updatedEntitySubgraphOrFunction;

                return updatedEntitySubgraph ?? previous;
              });
            },
          );
        }}
        onEntityUpdated={null}
      />

      {!readonly && (
        <Stack direction={"row"} gap={3}>
          <Button
            loading={savingChanges}
            disabled={submitDisabled}
            onClick={handleSaveChanges}
          >
            Save Changes
          </Button>
          <Button variant={"tertiary"} onClick={handleCancel}>
            Cancel
          </Button>
        </Stack>
      )}
    </Drawer>
  );
};
