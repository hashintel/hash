import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { ArrowLeftIcon, AutocompleteDropdown } from "@hashintel/design-system";
import { GRID_CLICK_IGNORE_CLASS } from "@hashintel/design-system/constants";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { PaperProps, Stack, Typography } from "@mui/material";
import { useEntityTypesContextRequired } from "../../../../../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useFileUploads } from "../../../../../../../../../shared/file-upload-context";
import { Button } from "../../../../../../../../../shared/ui/button";
import { FileUploadDropzone } from "../../../../../../../../settings/shared/file-upload-dropzone";
import { EntitySelector } from "../../../../../../../../shared/entity-selector";
import { WorkspaceContext } from "../../../../../../../../shared/workspace-context";
import { useEntityEditor } from "../../../../entity-editor-context";

interface EntitySelectorProps {
  includeDrafts: boolean;
  onSelect: (
    option: Entity,
    sourceSubgraph: Subgraph<EntityRootType> | null,
  ) => void;
  onFinishedEditing: () => void;
  expectedEntityTypes: EntityTypeWithMetadata[];
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
        <Button sx={{ width: "100%" }} variant={"tertiary"} onClick={close}>
          <ArrowLeftIcon sx={{ fontSize: 14, color: "gray.50", mr: 0.6 }} />
          <Typography variant={"smallTextLabels"} color={"gray.50"}>
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
}: EntitySelectorProps) => {
  const { entitySubgraph } = useEntityEditor();

  const entityId = getRoots(entitySubgraph)[0]?.metadata.recordId
    .entityId as EntityId;

  const [showUploadFileMenu, setShowUploadFileMenu] = useState(false);

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const isFileType = expectedEntityTypes.some(
    (expectedType) =>
      isSpecialEntityTypeLookup?.[expectedType.schema.$id]?.isFile,
  );
  const isImage =
    isFileType &&
    expectedEntityTypes.some(
      (expectedType) =>
        isSpecialEntityTypeLookup?.[expectedType.schema.$id]?.isImage,
    );

  const onCreateNew = () => {
    if (!expectedEntityTypes[0]) {
      return;
    }

    if (isFileType) {
      setShowUploadFileMenu(true);

      return;
    }

    /** @todo This should be replaced with a "new entity modal" or something else */
    void window.open(
      `/new/entity?entity-type-id=${encodeURIComponent(
        expectedEntityTypes[0].schema.$id,
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
            entityTypeId: expectedEntityTypes[0]?.schema.$id,
          },
        },
        makePublic: false,
        onComplete: (upload) => {
          onSelect(
            upload.createdEntities.fileEntity as Entity,
            // the entity's subgraph should mostly contain the file's type, since we're choosing it based on the expected type
            // it will not if the expected type is File and we automatically choose a narrower type of e.g. Image based on the upload
            entitySubgraph,
          );
        },
        ownedById: activeWorkspaceOwnedById,
        /**
         * Link creation is handled in the onSelect, since we might need to manage drafts,
         * but we supply linkEntityTypeId so we can track which files are being loaded against which link on an entity.
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
      entitySubgraph,
      expectedEntityTypes,
      linkEntityTypeId,
      onFinishedEditing,
      onSelect,
      uploadFile,
    ],
  );

  const fileCreationContextValue = useMemo(
    () => ({
      close: () => {
        setShowUploadFileMenu(false);
      },
      isImage,
      onFileProvided,
    }),
    [isImage, onFileProvided],
  );

  const highlightedRef = useRef<null | Entity>(null);

  return (
    <FileCreationContext.Provider value={fileCreationContextValue}>
      <EntitySelector
        open
        entityIdsToFilterOut={entityIdsToFilterOut}
        expectedEntityTypes={expectedEntityTypes}
        includeDrafts={includeDrafts}
        multiple={false}
        className={GRID_CLICK_IGNORE_CLASS}
        PaperComponent={showUploadFileMenu ? FileCreationPane : undefined}
        inputPlaceholder={isFileType ? "No file" : "No entity"}
        dropdownProps={{
          creationProps: {
            createButtonProps: {
              className: GRID_CLICK_IGNORE_CLASS,
              onMouseDown: (event) => {
                event.preventDefault();
                event.stopPropagation();
                onCreateNew();
              },
            },
            variant: isFileType ? "file" : "entity",
          },
        }}
        onSelect={onSelect}
        onHighlightChange={(_, value) => {
          highlightedRef.current = value;
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter" && !highlightedRef.current) {
            onCreateNew();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
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
