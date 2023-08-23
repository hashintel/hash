import { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  Button,
  Callout,
  FontAwesomeIcon,
  Modal,
  TYPE_SELECTOR_HEIGHT,
} from "@hashintel/design-system";
import { Box, Stack } from "@mui/material";
import { useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { useEntityTypesOptions } from "../shared/entity-types-options-context";
import { EntityTypeEditorFormData } from "../shared/form-types";
import { useIsReadonly } from "../shared/read-only-context";
import { linkEntityTypeUrl } from "../shared/urls";
import { InheritedTypeCard } from "./inheritance-row/inherited-type-card";
import { useValidateParents } from "./inheritance-row/use-validate-parents";
import { TypeSelector } from "./shared/insert-property-field/type-selector";
import { useFilterTypeOptions } from "./shared/use-filter-type-options";

type ModalData = {
  callback?: () => void;
  calloutMessage: string;
  type: "info" | "warning";
};

export const InheritanceRow = ({
  entityTypeId,
}: {
  entityTypeId: VersionedUrl;
}) => {
  const [typeSelectorOpen, setTypeSelectorOpen] = useState(false);
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const selectorInputRef = useRef<HTMLInputElement>(null);
  const [typeSelectorSearchText, setTypeSelectorSearchText] = useState("");

  const { control, setValue } = useFormContext<EntityTypeEditorFormData>();

  const directParentEntityTypeIds = useWatch({
    control,
    name: "allOf",
  });

  const properties = useWatch({
    control,
    name: "properties",
  });

  const links = useWatch({
    control,
    name: "links",
  });

  const { entityTypes, linkTypes } = useEntityTypesOptions();

  const { entityTypesArray, directParents } = useMemo(() => {
    const typesArray = [
      ...Object.values(entityTypes),
      ...Object.values(linkTypes),
    ];

    const parents = typesArray.filter(
      (type) =>
        // We intentionally hide the special Block Protocol Link entity from being displayed as a parent
        type.$id !== linkEntityTypeUrl &&
        directParentEntityTypeIds.includes(type.$id),
    );

    return { entityTypesArray: typesArray, directParents: parents };
  }, [entityTypes, linkTypes, directParentEntityTypeIds]);

  const entityTypeOptions = useFilterTypeOptions({
    typeOptions: entityTypesArray,
    typesToExclude: [...directParents, { $id: linkEntityTypeUrl }],
  });

  const isReadonly = useIsReadonly();

  const validateParents = useValidateParents();

  const setSelectorVisibility = (shouldBeVisible: boolean) => {
    if (shouldBeVisible) {
      setTypeSelectorOpen(true);
    } else {
      setTypeSelectorOpen(false);
      setTypeSelectorSearchText("");
    }
  };

  const addParent = (parent: EntityType) => {
    const proposedParentIds = [...directParentEntityTypeIds, parent.$id];

    try {
      validateParents({
        childEntityTypeId: entityTypeId,
        childLinksIds: links.map((link) => link.$id),
        childPropertiesIds: properties.map((property) => property.$id),
        directParentIds: proposedParentIds,
      });
    } catch (error) {
      setModalData({
        calloutMessage: (error as Error).message,
        type: "warning",
      });
      return;
    }

    const setNewParents = () => {
      setValue("allOf", proposedParentIds, {
        shouldDirty: true,
      });
      setSelectorVisibility(false);
    };

    if (proposedParentIds.length === 1 && linkTypes[proposedParentIds[0]!]) {
      setModalData({
        callback: setNewParents,
        calloutMessage:
          "You are adding a link type as a parent, which will make future versions of this type a link type.",
        type: "warning",
      });
      return;
    }

    setNewParents();
  };

  const removeParent = (parent: EntityType) => {
    const proposedNewParents = directParentEntityTypeIds.filter(
      (id) => id !== parent.$id,
    );

    const setNewParents = () => {
      setValue("allOf", proposedNewParents, { shouldDirty: true });
    };

    if (
      proposedNewParents.length === 0 &&
      directParentEntityTypeIds.find((id) => linkTypes[id])
    ) {
      setModalData({
        callback: setNewParents,
        calloutMessage:
          "Removing this parent, a link type, will mean future versions of this type are not link types.",
        type: "warning",
      });
      return;
    }

    setNewParents();
  };

  return (
    <>
      <Stack
        direction="row"
        alignItems="center"
        sx={{ height: TYPE_SELECTOR_HEIGHT }}
      >
        {directParents.length > 0 ? (
          directParents.map((type) => {
            return (
              <Box key={type.$id} sx={{ mr: 2 }}>
                <InheritedTypeCard
                  entityType={type}
                  onRemove={() => removeParent(type)}
                />
              </Box>
            );
          })
        ) : (
          <Box
            sx={({ palette }) => ({
              background: palette.gray[20],
              border: `1px solid ${palette.gray[30]}`,
              borderRadius: 1.5,
              color: palette.gray[80],
              fontSize: "var(--step--1)",
              px: 2,
              py: 1,
              mr: 2,
            })}
          >
            No other types yet
          </Box>
        )}
        {isReadonly ? null : typeSelectorOpen ? (
          <TypeSelector
            dropdownProps={{
              query: typeSelectorSearchText,
              createButtonProps: null,
              variant: "entity type",
            }}
            inputRef={selectorInputRef}
            onAdd={addParent}
            onCancel={() => setSelectorVisibility(false)}
            onSearchTextChange={setTypeSelectorSearchText}
            options={entityTypeOptions}
            searchText={typeSelectorSearchText}
            sx={{ width: 500 }}
            variant="entity type"
          />
        ) : (
          <Button
            onClick={() => setSelectorVisibility(true)}
            size="xs"
            variant="secondary_quiet"
          >
            ADD TYPE{" "}
            <FontAwesomeIcon
              icon={faPlus}
              sx={{
                display: "flex",
                alignItems: "center",
                fontSize: "var(--step--3)",
                ml: 0.7,
                mb: 0.1,
              }}
            />
          </Button>
        )}
      </Stack>
      {modalData && (
        <Modal open onClose={() => setModalData(null)}>
          <Stack spacing={3}>
            <Callout type={modalData.type}>{modalData.calloutMessage}</Callout>
            <Stack direction="row" spacing={2} justifyContent="space-between">
              {modalData.callback && (
                <Button
                  autoFocus
                  onClick={() => {
                    modalData.callback?.();
                    setModalData(null);
                  }}
                  sx={{ width: "50%" }}
                >
                  Continue
                </Button>
              )}
              <Button
                autoFocus={!modalData.callback}
                onClick={() => setModalData(null)}
                variant={modalData.callback ? "secondary" : "primary"}
                sx={{ width: modalData.callback ? "50%" : "100%" }}
              >
                {modalData.callback ? "Cancel" : "Close"}
              </Button>
            </Stack>
          </Stack>
        </Modal>
      )}
    </>
  );
};
