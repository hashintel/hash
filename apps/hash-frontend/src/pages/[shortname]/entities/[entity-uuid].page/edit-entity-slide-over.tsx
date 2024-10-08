import { useMutation, useQuery } from "@apollo/client";
import { ArrowUpRightRegularIcon, Skeleton } from "@hashintel/design-system";
import {
  mergePropertyObjectAndMetadata,
  patchesFromPropertyObjects,
} from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  fullOntologyResolveDepths,
  mapGqlSubgraphFieldsFragmentToSubgraph,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  extractOwnedByIdFromEntityId,
  splitEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Drawer, Stack, Typography } from "@mui/material";
import { RefObject, useCallback, useMemo, useState } from "react";

import { useUserOrOrgShortnameByOwnedById } from "../../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import {
  getEntitySubgraphQuery,
  updateEntityMutation,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { Button, Link } from "../../../../shared/ui";
import { EntityEditor } from "./entity-editor";
import { updateEntitySubgraphStateByEntity } from "./shared/update-entity-subgraph-state-by-entity";
import { useApplyDraftLinkEntityChanges } from "./shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./shared/use-draft-link-state";

interface EditEntitySlideOverProps {
  /**
   * Hide the link to open the entity in a new tab.
   */
  hideOpenInNew?: boolean;
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  readonly?: boolean;
  /**
   * If you already have a subgraph with the entity, its types and incoming/outgoing links to a depth of 1, provide it.
   * If you have a subgraph with partial data (e.g. no links), you can provide it along with `entityId`,
   * and the missing data will be fetched and loaded in when it is available.
   */
  entitySubgraph?: Subgraph<EntityRootType>;
  /**
   * If you don't already have the required subgraph, pass the entityId and it will be fetched.
   */
  entityId?: EntityId;
  /**
   * If a modal container ref is provided, the modal will be attached to it (defaults to the MUI default, the body)
   */
  modalContainerRef?: RefObject<HTMLDivElement>;
}

/**
 * @todo move this to a shared location (it's also used in the Flows output and draft entities views)
 */
export const EditEntitySlideOver = ({
  hideOpenInNew,
  modalContainerRef,
  open,
  onClose,
  onSubmit,
  readonly = false,
  entitySubgraph: providedEntitySubgraph,
  entityId: providedEntityId,
}: EditEntitySlideOverProps) => {
  if (!providedEntityId && !providedEntitySubgraph) {
    throw new Error(
      "One or both of entityId or entitySubgraph must be provided",
    );
  }

  const [localEntitySubgraph, setLocalEntitySubgraph] =
    useState<Subgraph<EntityRootType> | null>(providedEntitySubgraph ?? null);

  const [ownedByIdFromProvidedEntityId, entityUuid, draftId] = providedEntityId
    ? splitEntityId(providedEntityId)
    : [];

  /**
   * If the parent component didn't have the entitySubgraph already available,
   * we need to fetch it and set it in the local state (from where it will be updated if the user uses the editor form).
   */
  const { data: fetchedEntitySubgraph } = useQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    onCompleted: (data) => {
      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        data.getEntitySubgraph.subgraph,
      );

      setLocalEntitySubgraph(subgraph);
    },
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
            },
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: ownedByIdFromProvidedEntityId },
              ],
            },
            ...(draftId
              ? [
                  {
                    equal: [{ path: ["draftId"] }, { parameter: draftId }],
                  },
                ]
              : []),
          ],
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        graphResolveDepths: {
          ...fullOntologyResolveDepths,
          hasLeftEntity: { incoming: 1, outgoing: 1 },
          hasRightEntity: { incoming: 1, outgoing: 1 },
        },
        includeDrafts: !!draftId,
      },
      includePermissions: false,
    },
  });

  const originalEntitySubgraph = useMemo(() => {
    if (fetchedEntitySubgraph) {
      return mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        fetchedEntitySubgraph.getEntitySubgraph.subgraph,
      );
    }

    if (providedEntitySubgraph) {
      return providedEntitySubgraph;
    }

    return null;
  }, [providedEntitySubgraph, fetchedEntitySubgraph]);

  const [savingChanges, setSavingChanges] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);

  if (prevOpen !== open) {
    setPrevOpen(open);

    // reset state before opening modal
    if (open) {
      setSavingChanges(false);
      setIsDirty(false);
      if (originalEntitySubgraph) {
        setLocalEntitySubgraph(originalEntitySubgraph);
      }
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
    () => (localEntitySubgraph ? generateEntityLabel(localEntitySubgraph) : ""),
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

  const entity = localEntitySubgraph ? getRoots(localEntitySubgraph)[0] : null;

  const ownedById =
    ownedByIdFromProvidedEntityId ??
    (entity
      ? extractOwnedByIdFromEntityId(entity.metadata.recordId.entityId)
      : null);

  const { shortname: entityOwningShortname } = useUserOrOrgShortnameByOwnedById(
    { ownedById },
  );

  const handleSaveChanges = useCallback(async () => {
    if (!localEntitySubgraph || !originalEntitySubgraph) {
      throw new Error(`No original entity available`);
    }

    const draftEntity = getRoots(localEntitySubgraph)[0];
    const oldEntity = getRoots(originalEntitySubgraph)[0];

    if (!oldEntity) {
      throw new Error(`No original entity available in originalEntitySubgraph`);
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

      /** @todo add validation here */
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
    } catch (err) {
      setSavingChanges(false);
    }
  }, [
    applyDraftLinkEntityChanges,
    draftLinksToArchive,
    draftLinksToCreate,
    originalEntitySubgraph,
    localEntitySubgraph,
    onSubmit,
    resetEntityEditor,
    updateEntity,
  ]);

  const submitDisabled =
    !isDirty && !draftLinksToCreate.length && !draftLinksToArchive.length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
      ModalProps={{
        container: modalContainerRef?.current ?? undefined,
      }}
      PaperProps={{
        sx: (theme) => ({
          p: 5,
          gap: 6.5,
          maxWidth: 1200,
          height: "100%",
          width: "calc(100vw - 200px)",
          [theme.breakpoints.down("md")]: {
            width: "100%",
          },
        }),
      }}
    >
      {!entity || !localEntitySubgraph ? (
        <Stack gap={3}>
          <Skeleton height={60} />
          <Skeleton height={90} />
          <Skeleton height={500} />
        </Stack>
      ) : (
        <>
          <Stack alignItems="center" direction="row">
            <Typography variant="h2" color="gray.90" fontWeight="bold">
              {entityLabel}
            </Typography>
            {entityOwningShortname && !hideOpenInNew && (
              <Link
                href={generateEntityPath({
                  shortname: entityOwningShortname,
                  entityId: entity.metadata.recordId.entityId,
                  includeDraftId: true,
                })}
                target="_blank"
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
            onEntityUpdated={null}
            entitySubgraph={localEntitySubgraph}
            setEntity={(newEntity) => {
              setIsDirty(true);
              updateEntitySubgraphStateByEntity(
                newEntity,
                (updatedEntitySubgraphOrFunction) => {
                  setLocalEntitySubgraph((prev) => {
                    if (!prev) {
                      throw new Error(`No previous subgraph to update`);
                    }

                    const updatedEntitySubgraph =
                      typeof updatedEntitySubgraphOrFunction === "function"
                        ? updatedEntitySubgraphOrFunction(prev)
                        : updatedEntitySubgraphOrFunction;

                    return updatedEntitySubgraph ?? prev;
                  });
                },
              );
            }}
            isDirty={isDirty}
            draftLinksToCreate={draftLinksToCreate}
            setDraftLinksToCreate={setDraftLinksToCreate}
            draftLinksToArchive={draftLinksToArchive}
            setDraftLinksToArchive={setDraftLinksToArchive}
          />
        </>
      )}

      {!readonly && (
        <Stack direction="row" gap={3}>
          <Button
            onClick={handleSaveChanges}
            loading={savingChanges}
            disabled={submitDisabled}
          >
            Save Changes
          </Button>
          <Button onClick={handleCancel} variant="tertiary">
            Cancel
          </Button>
        </Stack>
      )}
    </Drawer>
  );
};
