import {
  ArrowLeftIcon,
  AutocompleteDropdown,
  GRID_CLICK_IGNORE_CLASS,
  SelectorAutocomplete,
} from "@hashintel/design-system";
import {
  Entity,
  EntityId,
  EntityTypeWithMetadata,
  OwnedById,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { PaperProps, Stack, Typography } from "@mui/material";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useBlockProtocolQueryEntities } from "../../../../../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import { generateEntityLabel } from "../../../../../../../../../lib/entities";
import { useEntityTypesContextRequired } from "../../../../../../../../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { useFileUploads } from "../../../../../../../../../shared/file-upload-context";
import { entityHasEntityTypeByVersionedUrlFilter } from "../../../../../../../../../shared/filters";
import { Button } from "../../../../../../../../../shared/ui/button";
import { FileUploadDropzone } from "../../../../../../../../settings/shared/file-upload-dropzone";
import { WorkspaceContext } from "../../../../../../../../shared/workspace-context";
import { useEntityEditor } from "../../../../entity-editor-context";

interface EntitySelectorProps {
  onSelect: (option: Entity) => void;
  onCancel: () => void;
  expectedEntityTypes: EntityTypeWithMetadata[];
  entityIdsToFilterOut?: EntityId[];
}

const FileCreationContext = createContext<
  | {
      close: () => void;
      onFileProvided: (file: File) => void;
    }
  | undefined
>(undefined);

const FileCreationPane = (props: PaperProps) => {
  const { close, onFileProvided } = useContext(FileCreationContext)!;

  return (
    <AutocompleteDropdown {...props} className={GRID_CLICK_IGNORE_CLASS}>
      <Stack spacing={2}>
        <FileUploadDropzone onFileProvided={onFileProvided} />
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

export const EntitySelector = ({
  onSelect,
  onCancel,
  expectedEntityTypes,
  entityIdsToFilterOut,
}: EntitySelectorProps) => {
  const { entitySubgraph } = useEntityEditor();
  const { queryEntities } = useBlockProtocolQueryEntities();
  const [search, setSearch] = useState("");

  const [showUploadFileMenu, setShowUploadFileMenu] = useState(false);

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const isFileType = expectedEntityTypes.some(
    (expectedType) =>
      isSpecialEntityTypeLookup?.[expectedType.schema.$id]?.file,
  );

  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const highlightedRef = useRef<null | Entity>(null);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const { data } = await queryEntities({
          data: {
            operation: {
              multiFilter: {
                filters: expectedEntityTypes.map(({ schema }) =>
                  entityHasEntityTypeByVersionedUrlFilter(schema.$id),
                ),
                operator: expectedEntityTypes.length > 0 ? "OR" : "AND",
              },
            },
          },
        });

        if (data) {
          setEntities(getRoots(data));
        }
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [queryEntities, expectedEntityTypes]);

  const sortedAndFilteredEntities = useMemo(() => {
    return [...entities]
      .filter(
        (entity) =>
          !entityIdsToFilterOut?.includes(entity.metadata.recordId.entityId),
      )
      .sort((a, b) =>
        a.metadata.temporalVersioning.decisionTime.start.limit.localeCompare(
          b.metadata.temporalVersioning.decisionTime.start.limit,
        ),
      );
  }, [entities, entityIdsToFilterOut]);

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
        expectedEntityTypes[0].schema.$id,
      )}`,
      "_blank",
    );
  };

  const { uploadFile } = useFileUploads();
  const { activeWorkspaceAccountId } = useContext(WorkspaceContext);

  const onFileProvided = useCallback(
    async (file: File) => {
      if (!activeWorkspaceAccountId) {
        throw new Error("Cannot upload file without active workspace");
      }
      const { createdEntities } = await uploadFile({
        fileData: { entityTypeId: expectedEntityTypes[0]?.schema.$id, file },
        ownedById: activeWorkspaceAccountId as OwnedById,
      });
      onSelect(createdEntities!.fileEntity as unknown as Entity);
    },
    [activeWorkspaceAccountId, expectedEntityTypes, onSelect, uploadFile],
  );

  const fileCreationContextValue = useMemo(
    () => ({
      close: () => setShowUploadFileMenu(false),
      onFileProvided,
    }),
    [onFileProvided],
  );

  return (
    <FileCreationContext.Provider value={fileCreationContextValue}>
      <SelectorAutocomplete
        className={GRID_CLICK_IGNORE_CLASS}
        open
        PaperComponent={showUploadFileMenu ? FileCreationPane : undefined}
        dropdownProps={{
          query: search,
          createButtonProps: {
            className: GRID_CLICK_IGNORE_CLASS,
            onMouseDown: (evt) => {
              evt.preventDefault();
              evt.stopPropagation();
              onCreateNew();
            },
          },
          variant: isFileType ? "file" : "entity",
        }}
        loading={loading}
        options={sortedAndFilteredEntities}
        optionToRenderData={(entity) => ({
          entityProperties: entity.properties,
          uniqueId: entity.metadata.recordId.entityId,
          Icon: null,
          /**
           * @todo update SelectorAutocomplete to show an entity's namespace as well as / instead of its entityTypeId
           * */
          typeId: entity.metadata.entityTypeId,
          title: generateEntityLabel(entitySubgraph, entity),
        })}
        inputPlaceholder={isFileType ? "No file" : "No entity"}
        inputValue={search}
        onInputChange={(_, value) => setSearch(value)}
        onHighlightChange={(_, value) => {
          highlightedRef.current = value;
        }}
        onChange={(_, option) => {
          onSelect(option);
        }}
        onKeyUp={(evt) => {
          if (evt.key === "Enter" && !highlightedRef.current) {
            onCreateNew();
          }
        }}
        onKeyDown={(evt) => {
          if (evt.key === "Escape") {
            onCancel();
          }
        }}
        onBlur={() => {
          // onCancel();
        }}
      />
    </FileCreationContext.Provider>
  );
};
