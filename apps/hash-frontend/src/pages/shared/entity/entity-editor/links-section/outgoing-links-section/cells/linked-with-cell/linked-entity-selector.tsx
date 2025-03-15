import type { EntityType, VersionedUrl } from "@blockprotocol/type-system";
import { ArrowLeftIcon, AutocompleteDropdown } from "@hashintel/design-system";
import { GRID_CLICK_IGNORE_CLASS } from "@hashintel/design-system/constants";
import type { Entity } from "@local/hash-graph-sdk/entity";
import { getClosedMultiEntityTypeFromMap } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
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

import { useEntityTypesContextRequired } from "../../../../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useFileUploads } from "../../../../../../../../shared/file-upload-context";
import { Button } from "../../../../../../../../shared/ui/button";
import { FileUploadDropzone } from "../../../../../../../settings/shared/file-upload-dropzone";
import { EntitySelector } from "../../../../../../entity-selector";
import { WorkspaceContext } from "../../../../../../workspace-context";
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
      onFilesProvided: (files: [File, ...File[]]) => void;
    }
  | undefined
>(undefined);

const FileCreationPane = (props: PaperProps) => {
  const { close, isImage, onFilesProvided } = useContext(FileCreationContext)!;

  return (
    <AutocompleteDropdown {...props} className={GRID_CLICK_IGNORE_CLASS}>
      <Stack spacing={2}>
        <FileUploadDropzone
          image={isImage}
          multiple={false}
          onFilesProvided={onFilesProvided}
        />
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
  const { entity, readonly } = useEntityEditor();

  const entityId = entity.metadata.recordId.entityId;

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

  const onFilesProvided = useCallback(
    async (files: [File, ...File[]]) => {
      if (!activeWorkspaceOwnedById) {
        throw new Error("Cannot upload file without active workspace");
      }

      // Close the dropdown immediately as we want the file upload to happen in the background
      onFinishedEditing();

      const file = files[0];

      await uploadFile({
        fileData: {
          file,
          fileEntityCreationInput: {
            entityTypeId: expectedEntityTypes[0]?.$id,
          },
        },
        makePublic: false,
        onComplete: (upload) => {
          const fileEntity = upload.createdEntities.fileEntity;

          const label =
            fileEntity.properties[
              "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"
            ] ??
            fileEntity.properties[
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
      onFilesProvided,
    }),
    [isImage, onFilesProvided],
  );

  const highlightedRef = useRef<null | Entity>(null);

  return (
    <FileCreationContext.Provider value={fileCreationContextValue}>
      <EntitySelector
        entityIdsToFilterOut={entityIdsToFilterOut}
        expectedEntityTypes={expectedEntityTypes}
        includeDrafts={includeDrafts}
        multiple={false}
        onSelect={(selectedEntity, closedMultiEntityTypeMap) => {
          const closedType = getClosedMultiEntityTypeFromMap(
            closedMultiEntityTypeMap,
            selectedEntity.metadata.entityTypeIds,
          );

          const label = generateEntityLabel(closedType, selectedEntity);

          onSelect(selectedEntity, label);
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
