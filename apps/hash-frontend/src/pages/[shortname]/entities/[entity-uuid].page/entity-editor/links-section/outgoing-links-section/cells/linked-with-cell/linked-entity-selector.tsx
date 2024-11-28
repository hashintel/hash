import type { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { ArrowLeftIcon, AutocompleteDropdown } from "@hashintel/design-system";
import { GRID_CLICK_IGNORE_CLASS } from "@hashintel/design-system/constants";
import type { Entity } from "@local/hash-graph-sdk/entity";
import { getClosedMultiEntityTypeFromMap } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { PaperProps } from "@mui/material";
import { Stack, Typography } from "@mui/material";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { useEntityTypesContextRequired } from "../../../../../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useFileUploads } from "../../../../../../../../../shared/file-upload-context";
import { Button } from "../../../../../../../../../shared/ui/button";
import { FileUploadDropzone } from "../../../../../../../../settings/shared/file-upload-dropzone";
import { EntitySelector } from "../../../../../../../../shared/entity-selector";
import { WorkspaceContext } from "../../../../../../../../shared/workspace-context";
import { useEntityEditor } from "../../../../entity-editor-context";

interface LinkedEntitySelectorProps {
  includeDrafts: boolean;
  onSelect: (option: Entity, entityLabel: string) => void;
  onFinishedEditing: () => void;
  expectedEntityTypes: Pick<EntityType, "$id">[];
  entityIdsToFilterOut?: EntityId[];
  linkEntityTypeId: VersionedUrl;
}

const FileCreationContext = createContext<
  | {
      close: () => void;
      isImage: boolean;
      onFileProvided: (file: File) => void;
    }
  | undefined
>(undefined);

const FileCreationPane = (props: PaperProps) => {
  const { close, isImage, onFileProvided } = useContext(FileCreationContext)!;

  return (
    <AutocompleteDropdown {...props} className={GRID_CLICK_IGNORE_CLASS}>
      <Stack spacing={2}>
        <FileUploadDropzone image={isImage} onFileProvided={onFileProvided} />
        <Button onClick={close} sx={{ width: "100%" }} variant="tertiary">
          <ArrowLeftIcon sx={{ fontSize: 14, color: "gray.50", mr: 0.6 }} />
          <Typography variant="smallTextLabels" color="gray.50">
            Go back
          </Typography>
        </Button>
      </Stack>
    </AutocompleteDropdown>
  );
};

export const LinkedEntitySelector = ({
  includeDrafts,
  onSelect,
  onFinishedEditing,
  expectedEntityTypes,
  entityIdsToFilterOut,
  linkEntityTypeId,
}: LinkedEntitySelectorProps) => {
  const { entitySubgraph, readonly } = useEntityEditor();

  const entityId = getRoots(entitySubgraph)[0]?.metadata.recordId
    .entityId as EntityId;

  const [showUploadFileMenu, setShowUploadFileMenu] = useState(false);

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const isFileType = expectedEntityTypes.some(
    (expectedType) => isSpecialEntityTypeLookup?.[expectedType.$id]?.isFile,
  );
  const isImage =
    isFileType &&
    expectedEntityTypes.some(
      (expectedType) => isSpecialEntityTypeLookup?.[expectedType.$id]?.isImage,
    );

  const onCreateNew = () => {
    if (!expectedEntityTypes[0]) {
      return;
    }

    if (isFileType) {
      setShowUploadFileMenu(true);
      return;
    }

    /** @todo this should be replaced with a "new entity modal" or something else */
    void window.open(
      `/new/entity?entity-type-id=${encodeURIComponent(
        expectedEntityTypes[0].$id,
      )}`,
      "_blank",
    );
  };

  const { uploadFile } = useFileUploads();
  const { activeWorkspaceOwnedById } = useContext(WorkspaceContext);

  const onFileProvided = useCallback(
    async (file: File) => {
      if (!activeWorkspaceOwnedById) {
        throw new Error("Cannot upload file without active workspace");
      }

      // Close the dropdown immediately as we want the file upload to happen in the background
      onFinishedEditing();

      await uploadFile({
        fileData: {
          file,
          fileEntityCreationInput: {
            entityTypeId: expectedEntityTypes[0]?.$id,
          },
        },
        makePublic: false,
        onComplete: (upload) => {
          const entity = upload.createdEntities.fileEntity;

          const label =
            entity.properties[
              "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"
            ] ??
            entity.properties[
              "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"
            ] ??
            "File";

          onSelect(upload.createdEntities.fileEntity as Entity, label);
        },
        ownedById: activeWorkspaceOwnedById,
        /**
         * Link creation is handled in the onSelect, since we might need to manage drafts,
         * but we supply linkEntityTypeId so we can track which files are being loaded against which link on an entity
         */
        linkedEntityData: {
          linkedEntityId: entityId,
          linkEntityTypeId,
          skipLinkCreationAndDeletion: true,
        },
      });

      /** Upload error handling is in {@link LinkedWithCell} */
    },
    [
      activeWorkspaceOwnedById,
      entityId,
      expectedEntityTypes,
      linkEntityTypeId,
      onFinishedEditing,
      onSelect,
      uploadFile,
    ],
  );

  const fileCreationContextValue = useMemo(
    () => ({
      close: () => setShowUploadFileMenu(false),
      isImage,
      onFileProvided,
    }),
    [isImage, onFileProvided],
  );

  const highlightedRef = useRef<null | Entity>(null);

  return (
    <FileCreationContext.Provider value={fileCreationContextValue}>
      <EntitySelector
        entityIdsToFilterOut={entityIdsToFilterOut}
        expectedEntityTypes={expectedEntityTypes}
        includeDrafts={includeDrafts}
        multiple={false}
        onSelect={(entity, closedMultiEntityTypeMap) => {
          const closedType = getClosedMultiEntityTypeFromMap(
            closedMultiEntityTypeMap,
            entity.metadata.entityTypeIds,
          );

          const label = generateEntityLabel(closedType, entity);

          onSelect(entity, label);
        }}
        className={GRID_CLICK_IGNORE_CLASS}
        open
        readOnly={readonly}
        PaperComponent={showUploadFileMenu ? FileCreationPane : undefined}
        dropdownProps={{
          creationProps: {
            createButtonProps: {
              className: GRID_CLICK_IGNORE_CLASS,
              onMouseDown: (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                onCreateNew();
              },
            },
            variant: isFileType ? "file" : "entity",
          },
        }}
        inputPlaceholder={isFileType ? "No file" : "No entity"}
        onHighlightChange={(_, value) => {
          highlightedRef.current = value;
        }}
        onKeyUp={(evt) => {
          if (evt.key === "Enter" && !highlightedRef.current) {
            onCreateNew();
          }
        }}
        onKeyDown={(evt) => {
          if (evt.key === "Escape") {
            onFinishedEditing();
          }
        }}
        onClickAway={() => {
          if (!showUploadFileMenu) {
            onFinishedEditing();
          }
        }}
      />
    </FileCreationContext.Provider>
  );
};
