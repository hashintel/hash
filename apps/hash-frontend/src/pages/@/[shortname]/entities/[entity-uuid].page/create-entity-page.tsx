import { useMutation } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
import {
  Entity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import type { PropertyObject } from "@local/hash-graph-types/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useState } from "react";

import { PageErrorState } from "../../../../../components/page-error-state";
import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../../../graphql/api-types.gen";
import {
  createEntityMutation,
  getEntitySubgraphQuery,
} from "../../../../../graphql/queries/knowledge/entity.queries";
import { Link } from "../../../../../shared/ui/link";
import { generateUseEntityTypeEntitiesQueryVariables } from "../../../../../shared/use-entity-type-entities";
import { useGetClosedMultiEntityType } from "../../../../shared/use-get-closed-multi-entity-type";
import type { MinimalEntityValidationReport } from "../../../../shared/use-validate-entity";
import { useValidateEntity } from "../../../../shared/use-validate-entity";
import { WorkspaceContext } from "../../../../shared/workspace-context";
import { EditBar } from "../../shared/edit-bar";
import { createInitialDraftEntitySubgraph } from "./create-entity-page/create-initial-draft-entity-subgraph";
import type { EntityEditorProps } from "./entity-editor";
import { EntityEditorPage } from "./entity-editor-page";
import { EntityPageLoadingState } from "./entity-page-loading-state";
import { createDraftEntitySubgraph } from "./shared/create-draft-entity-subgraph";
import { useApplyDraftLinkEntityChanges } from "./shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./shared/use-draft-link-state";
import { useHandleTypeChanges } from "./shared/use-handle-type-changes";

interface CreateEntityPageProps {
  entityTypeId: VersionedUrl;
}

export const CreateEntityPage = ({ entityTypeId }: CreateEntityPageProps) => {
  const router = useRouter();
  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] = useDraftLinkState();

  const { getClosedMultiEntityType, loading: closedTypeLoading } =
    useGetClosedMultiEntityType();

  const [draftEntityTypesDetails, setDraftEntityTypesDetails] =
    useState<
      Pick<
        EntityEditorProps,
        "closedMultiEntityType" | "closedMultiEntityTypesDefinitions"
      >
    >();

  const [draftEntitySubgraph, setDraftEntitySubgraph] = useState<
    Subgraph<EntityRootType> | undefined
  >(() => createInitialDraftEntitySubgraph([entityTypeId]));

  const fetchAndSetTypeDetails = useCallback(
    async (entityTypeIds: VersionedUrl[]) => {
      await getClosedMultiEntityType(entityTypeIds).then((result) => {
        setDraftEntityTypesDetails(result);
      });
    },
    [getClosedMultiEntityType],
  );

  useEffect(() => {
    void fetchAndSetTypeDetails([entityTypeId]);
  }, [entityTypeId, fetchAndSetTypeDetails]);

  const handleTypeChanges = useHandleTypeChanges({
    entitySubgraph: draftEntitySubgraph,
    setDraftEntityTypesDetails,
    setDraftEntitySubgraph,
    setDraftLinksToArchive,
  });

  const { activeWorkspace, activeWorkspaceOwnedById } =
    useContext(WorkspaceContext);

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation, {
    refetchQueries: [
      /**
       * This refetch query accounts for the "Entities" section
       * in the sidebar being updated when the first instance of
       * a type is created by a user that is from a different web.
       */
      {
        query: getEntitySubgraphQuery,
        variables: generateUseEntityTypeEntitiesQueryVariables({
          ownedByIds: activeWorkspaceOwnedById
            ? [activeWorkspaceOwnedById]
            : undefined,
        }),
      },
    ],
  });

  const [creating, setCreating] = useState(false);

  const [validationReport, setValidationReport] =
    useState<MinimalEntityValidationReport | null>(null);

  const { validateEntity: validateFn } = useValidateEntity();

  const validateEntity = useCallback(
    async (entity: Entity) => {
      const report = await validateFn({
        properties: entity.propertiesWithMetadata,
        entityTypeIds: entity.metadata.entityTypeIds,
      });

      return report;
    },
    [validateFn],
  );

  if (!draftEntitySubgraph) {
    throw new Error("No draft entity subgraph");
  }

  const entity = getRoots(draftEntitySubgraph)[0]!;

  /**
   * `overrideProperties` is a quick hack to bypass the setting draftEntity state
   * I did this, because I was having trouble with the `setDraftEntitySubgraph` function,
   * I tried calling handleCreateEntity after setting the draftEntity state, but state was not updating
   * @todo find a better way to do this
   */
  const handleCreateEntity = async (overrideProperties?: PropertyObject) => {
    if (!activeWorkspace) {
      return;
    }

    const draftEntity = getRoots(draftEntitySubgraph)[0];

    if (!draftEntity) {
      return;
    }

    const report = await validateEntity(draftEntity);

    setValidationReport(report);

    if (report) {
      return;
    }

    try {
      setCreating(true);
      const { data } = await createEntity({
        variables: {
          entityTypeIds: entity.metadata.entityTypeIds,
          ownedById: activeWorkspaceOwnedById,
          properties: mergePropertyObjectAndMetadata(
            overrideProperties ?? draftEntity.properties,
            draftEntity.metadata.properties,
          ),
        },
      });

      const createdEntity = data?.createEntity
        ? new Entity(data.createEntity)
        : null;

      if (!createdEntity) {
        return;
      }

      await applyDraftLinkEntityChanges(
        createdEntity,
        draftLinksToCreate,
        draftLinksToArchive,
      );

      const entityId = extractEntityUuidFromEntityId(
        createdEntity.metadata.recordId.entityId,
      );

      void router.push(`/@${activeWorkspace.shortname}/entities/${entityId}`);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (closedTypeLoading) {
    return <EntityPageLoadingState />;
  }

  if (!draftEntityTypesDetails) {
    return <PageErrorState />;
  }

  const entityLabel = generateEntityLabel(
    draftEntityTypesDetails.closedMultiEntityType,
    entity,
  );

  const isQueryEntity =
    entityTypeId === blockProtocolEntityTypes.query.entityTypeId;

  return (
    <>
      {errorMessage && (
        <AlertModal
          calloutMessage={errorMessage}
          close={() => setErrorMessage("")}
          header="Couldn't create entity"
          type="warning"
        >
          <Typography>
            Please <Link href="https://hash.ai/contact">contact us</Link> and
            tell us what entity you were trying to create when this happened
          </Typography>
        </AlertModal>
      )}
      <EntityEditorPage
        {...draftEntityTypesDetails}
        closedMultiEntityTypesMap={null}
        editBar={
          <EditBar
            hasErrors={!!validationReport}
            label="- this entity has not been created yet"
            visible
            discardButtonProps={{
              href: "/new/entity",
              children: "Discard entity",
            }}
            confirmButtonProps={{
              onClick: () => handleCreateEntity(),
              loading: creating,
              children: "Create entity",
            }}
          />
        }
        entityLabel={entityLabel}
        entityUuid="draft"
        owner={`@${activeWorkspace?.shortname}`}
        isQueryEntity={isQueryEntity}
        isDirty
        isDraft
        handleSaveChanges={handleCreateEntity}
        handleTypesChange={async (change) => {
          const updatedEntity = await handleTypeChanges(change);
          await validateEntity(updatedEntity).then(setValidationReport);
        }}
        setEntity={async (changedEntity) => {
          setDraftEntitySubgraph((prev) => {
            return createDraftEntitySubgraph({
              currentSubgraph: prev,
              entity: changedEntity,
              entityTypeIds: changedEntity.metadata.entityTypeIds,
              omitProperties: [],
            });
          });
          await validateEntity(changedEntity).then(setValidationReport);
        }}
        draftLinksToCreate={draftLinksToCreate}
        setDraftLinksToCreate={setDraftLinksToCreate}
        draftLinksToArchive={draftLinksToArchive}
        setDraftLinksToArchive={setDraftLinksToArchive}
        entitySubgraph={draftEntitySubgraph}
        readonly={false}
        onEntityUpdated={null}
        validationReport={validationReport}
      />
    </>
  );
};
