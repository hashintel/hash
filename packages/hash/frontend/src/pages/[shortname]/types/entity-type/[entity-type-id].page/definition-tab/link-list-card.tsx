import { EntityType, VersionedUri } from "@blockprotocol/type-system";
import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import { Chip, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { OwnedById } from "@hashintel/hash-shared/types";
import { linkEntityTypeUri } from "@hashintel/hash-subgraph";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import {
  Box,
  PopperPlacementType,
  Stack,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
} from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { useResizeObserverRef } from "rooks";

import { useBlockProtocolCreateEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-entity-type";
import { useBlockProtocolGetEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { useBlockProtocolUpdateEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-update-entity-type";
import {
  useEntityTypes,
  useFetchEntityTypes,
  useLinkEntityTypes,
  useLinkEntityTypesOptional,
} from "../../../../../../shared/entity-types-context/hooks";
import { LinkIcon } from "../../../../../../shared/icons/link";
import {
  HashSelectorAutocomplete,
  TYPE_SELECTOR_HEIGHT,
} from "../../../../shared/hash-selector-autocomplete";
import {
  popperPlacementInputNoRadius,
  popperPlacementPopperNoRadius,
  popperPlacementSelectors,
  setPopperPlacementAttribute,
} from "../../../../shared/popper-placement-modifier";
import { StyledPlusCircleIcon } from "../../../../shared/styled-plus-circle-icon";
import { useRouteNamespace } from "../../../../shared/use-route-namespace";
import { EntityTypeEditorForm } from "../shared/form-types";
import { EmptyListCard } from "./shared/empty-list-card";
import {
  EntityTypeTable,
  EntityTypeTableButtonRow,
  EntityTypeTableCenteredCell,
  EntityTypeTableHeaderRow,
  EntityTypeTableRow,
  EntityTypeTableTitleCellText,
} from "./shared/entity-type-table";
import { InsertTypeRow, InsertTypeRowProps } from "./shared/insert-type-row";
import { MultipleValuesCell } from "./shared/multiple-values-cell";
import { QuestionIcon } from "./shared/question-icon";
import {
  generateInitialTypeUri,
  TypeForm,
  TypeFormDefaults,
  TypeFormModal,
  TypeFormProps,
  useGenerateTypeBaseUri,
} from "./shared/type-form";
import { TYPE_MENU_CELL_WIDTH, TypeMenuCell } from "./shared/type-menu-cell";
import { useStateCallback } from "./shared/use-state-callback";

const formDataToEntityType = (data: TypeFormDefaults) => ({
  type: "object" as const,
  kind: "entityType" as const,
  title: data.name,
  description: data.description,
  allOf: [
    {
      $ref: linkEntityTypeUri,
    },
  ],
  properties: {},
});

export const LinkTypeForm = (props: TypeFormProps) => {
  const { getEntityType } = useBlockProtocolGetEntityType();
  const generateTypeBaseUri = useGenerateTypeBaseUri("entity-type");

  const nameExists = async (name: string) => {
    const entityTypeId = generateInitialTypeUri(generateTypeBaseUri(name));

    const res = await getEntityType({
      data: {
        entityTypeId,
        graphResolveDepths: {
          constrainsValuesOn: { outgoing: 0 },
          constrainsPropertiesOn: { outgoing: 0 },
        },
      },
    });

    if (!res.data) {
      // @todo consider non-crash error handling
      throw new Error("Unable to check whether name is available");
    }

    return !!getEntityTypeById(res.data, entityTypeId);
  };

  return <TypeForm nameExists={nameExists} {...props} />;
};

const LinkTypeRow = ({
  linkIndex,
  onRemove,
  onUpdateVersion,
}: {
  linkIndex: number;
  onRemove: () => void;
  onUpdateVersion: (nextId: VersionedUri) => void;
}) => {
  const { control, setValue } = useFormContext<EntityTypeEditorForm>();

  const [entityTypeSelectorPopupOpen, setEntityTypeSelectorPopupOpen] =
    useState(false);

  const linkTypes = useLinkEntityTypes();
  const entityTypes = useEntityTypes();
  const linkId = useWatch({
    control,
    name: `links.${linkIndex}.$id`,
  });

  const chosenEntityTypes = useWatch({
    control,
    name: `links.${linkIndex}.entityTypes`,
  });

  const popupId = useId();
  const menuPopupState = usePopupState({
    variant: "popover",
    popupId: `property-menu-${popupId}`,
  });

  const editModalPopupId = useId();
  const editModalPopupState = usePopupState({
    variant: "popover",
    popupId: `editLink-${editModalPopupId}`,
  });

  const { updateEntityType } = useBlockProtocolUpdateEntityType();
  const refetchEntityTypes = useFetchEntityTypes();
  const onUpdateVersionRef = useRef(onUpdateVersion);
  useLayoutEffect(() => {
    onUpdateVersionRef.current = onUpdateVersion;
  });

  const handleSubmit = async (data: TypeFormDefaults) => {
    const res = await updateEntityType({
      data: {
        entityTypeId: linkId,
        entityType: formDataToEntityType(data),
      },
    });

    if (!res.data) {
      throw new Error("Failed to update property type");
    }

    await refetchEntityTypes();

    onUpdateVersionRef.current(res.data.schema.$id);

    editModalPopupState.close();
  };

  const link = linkTypes[linkId];

  if (!link) {
    throw new Error("Missing link");
  }

  const entityTypeSchemas = Object.values(entityTypes).map(
    (type) => type.schema,
  );

  const chosenEntityTypeSchemas = entityTypeSchemas.filter((schema) =>
    chosenEntityTypes.includes(schema.$id),
  );

  const entityTypeSelectorRef = useRef<HTMLDivElement>(null);

  // const [inputWrapperRef, inputWrapperRect] = useBoundingclientrectRef();

  // console.log(inputWrapperRect);

  const [inputWrapperHeight, setInputWrapperHeight] = useState(66);
  const [resizeObserverRef] = useResizeObserverRef(([size]) => {
    const resizeObserverSize = size?.borderBoxSize[0];
    if (resizeObserverSize) {
      setInputWrapperHeight(resizeObserverSize.blockSize);
    }
  });

  const selectorOffset = TYPE_SELECTOR_HEIGHT + inputWrapperHeight;

  return (
    <>
      <EntityTypeTableRow>
        <TableCell>
          <EntityTypeTableTitleCellText>
            {link.schema.title}
          </EntityTypeTableTitleCellText>
        </TableCell>
        <TableCell
          sx={{
            "&, *": {
              cursor: "pointer",
            },
          }}
        >
          <Box
            sx={(theme) => ({
              position: "relative",
              ...(entityTypeSelectorPopupOpen
                ? { zIndex: theme.zIndex.modal + 1 }
                : {}),

              [entityTypeSelectorPopupOpen ? "& > *" : "&:hover > *"]: {
                boxShadow: theme.boxShadows.xs,
                borderColor: `${theme.palette.gray[30]} !important`,
                backgroundColor: "white",
              },
            })}
            ref={entityTypeSelectorRef}
          >
            <Stack
              direction="row"
              flexWrap="wrap"
              sx={[
                (theme) => ({
                  border: 1,
                  borderColor: "transparent",
                  borderRadius: 1.5,
                  p: 0.5,
                  userSelect: "none",
                  minWidth: 200,
                  minHeight: 42,
                  left: -7,
                  width: "calc(100% + 14px)",
                  overflow: "hidden",
                  position: "relative",
                  zIndex: theme.zIndex.drawer,
                }),
              ]}
              onClick={() => setEntityTypeSelectorPopupOpen(true)}
            >
              {chosenEntityTypes.length ? (
                chosenEntityTypes.map((entityTypeId) => {
                  const type = entityTypes[entityTypeId];

                  if (!type) {
                    throw new Error("Entity type missing in links table");
                  }

                  return (
                    <Chip
                      sx={{ m: 0.25 }}
                      color="blue"
                      label={
                        <Stack
                          direction="row"
                          spacing={0.75}
                          fontSize={14}
                          alignItems="center"
                        >
                          <FontAwesomeIcon
                            icon={faAsterisk}
                            sx={{ fontSize: "inherit" }}
                          />
                          <Box component="span">{type.schema.title}</Box>
                        </Stack>
                      }
                      key={type.schema.$id}
                    />
                  );
                })
              ) : (
                <Chip
                  color="blue"
                  variant="outlined"
                  label={
                    <Stack
                      direction="row"
                      spacing={0.75}
                      fontSize={14}
                      alignItems="center"
                    >
                      <FontAwesomeIcon
                        icon={faAsterisk}
                        sx={{ fontSize: "inherit" }}
                      />
                      <Box component="span">Anything</Box>
                    </Stack>
                  }
                />
              )}
            </Stack>
            {entityTypeSelectorPopupOpen ? (
              <Box
                ref={resizeObserverRef}
                onClick={(evt) => {
                  evt.stopPropagation();
                  evt.preventDefault();
                }}
                sx={[
                  (theme) => ({
                    position: "absolute",
                    left: -19,
                    right: -19,
                    top: -12,
                    bottom: -12,
                    background: "white",
                    borderRadius: 1.5,
                    border: 1,
                    borderColor: theme.palette.gray[30],
                    boxShadow: theme.boxShadows.md,
                    zIndex: theme.zIndex.drawer - 1,

                    // [`${popperPlacementSelectors.top} &`]: {
                    //   borderTopLeftRadius: "0 !important",
                    //   borderTopRightRadius: "0 !important",
                    // },
                    //
                    // [`${popperPlacementSelectors.bottom} &`]: {
                    //   borderBottomLeftRadius: "0 !important",
                    //   borderBottomRightRadius: "0 !important",
                    // },

                    // ...(entityTypeSelectorPlacement === "top"
                    //   ? {
                    //       borderTopLeftRadius: "0 !important",
                    //       borderTopRightRadius: "0 !important",
                    //     }
                    //   : {
                    //       borderBottomLeftRadius: "0 !important",
                    //       borderBottomRightRadius: "0 !important",
                    //     }),
                  }),
                  popperPlacementInputNoRadius,
                ]}
              >
                <HashSelectorAutocomplete
                  multiple
                  sx={[
                    popperPlacementPopperNoRadius,
                    {
                      minWidth: 440,
                      position: "absolute",
                      left: -1,
                      width: "calc(100% + 2px)",
                      height: TYPE_SELECTOR_HEIGHT + selectorOffset,

                      [`${popperPlacementSelectors.top} &`]: {
                        bottom: `calc(100% - ${selectorOffset}px)`,
                        paddingBottom: `${selectorOffset}px`,
                      },

                      [`${popperPlacementSelectors.bottom} &`]: {
                        top: `calc(100% - ${selectorOffset}px)`,
                        paddingTop: `${selectorOffset}px`,
                      },
                    },
                  ]}
                  open
                  onChange={(_, chosenTypes) => {
                    setValue(
                      `links.${linkIndex}.entityTypes`,
                      chosenTypes.map((type) => type.$id),
                    );
                  }}
                  options={entityTypeSchemas}
                  optionToRenderData={({ $id, title, description }) => ({
                    $id,
                    title,
                    description,
                  })}
                  dropdownProps={{
                    query: "",
                    createButtonProps: null,
                    variant: "entityType",
                  }}
                  joined
                  renderTags={() => <Box />}
                  value={chosenEntityTypeSchemas}
                  modifiers={[
                    {
                      name: "addPositionClass",
                      phase: "write",
                      options: {
                        update(placement: PopperPlacementType) {
                          const node = entityTypeSelectorRef.current;
                          if (node) {
                            setPopperPlacementAttribute(node, placement);
                          }
                        },
                      },
                    },
                  ]}
                  onKeyDown={(evt) => {
                    if (evt.key === "Escape") {
                      setEntityTypeSelectorPopupOpen(false);
                    }
                  }}
                  onBlur={() => {
                    // setEntityTypeSelectorPopupOpen(false);
                  }}
                />
              </Box>
            ) : null}
          </Box>
        </TableCell>
        <MultipleValuesCell index={linkIndex} variant="link" />
        <TypeMenuCell
          typeId={linkId}
          editButtonProps={bindTrigger(editModalPopupState)}
          popupState={menuPopupState}
          variant="link"
          onRemove={onRemove}
        />
      </EntityTypeTableRow>
      <TypeFormModal
        as={LinkTypeForm}
        popupState={editModalPopupState}
        modalTitle={<>Edit link</>}
        onSubmit={handleSubmit}
        submitButtonProps={{ children: <>Edit link</> }}
        disabledFields={["name"]}
        getDefaultValues={() => ({
          name: link.schema.title,
          description: link.schema.description,
        })}
      />
    </>
  );
};

const InsertLinkRow = (
  props: Omit<
    InsertTypeRowProps<EntityType>,
    "options" | "variant" | "createButtonProps"
  >,
) => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const links = useWatch({ control, name: "links" });

  const linkTypes = Object.values(useLinkEntityTypes()).map(
    (link) => link.schema,
  );

  // @todo make more efficient
  const filteredLinkTypes = linkTypes.filter(
    (type) => !links.some((includedLink) => includedLink.$id === type.$id),
  );

  return (
    <InsertTypeRow {...props} options={filteredLinkTypes} variant="link" />
  );
};

export const LinkListCard = () => {
  const { control, setValue } = useFormContext<EntityTypeEditorForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "links" });
  const linkEntityTypes = useLinkEntityTypesOptional();
  const [addingNewLink, setAddingNewLink] = useStateCallback(false);
  const addingNewLinkRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");
  const modalId = useId();
  const createModalPopupState = usePopupState({
    variant: "popover",
    popupId: `createLink-${modalId}`,
  });

  const { routeNamespace } = useRouteNamespace();
  const refetchEntityTypes = useFetchEntityTypes();
  const { createEntityType } = useBlockProtocolCreateEntityType(
    routeNamespace?.accountId as OwnedById,
  );

  const cancelAddingNewLink = () => {
    setAddingNewLink(false);
    setSearchText("");
  };

  const handleAddEntityType = (link: EntityType) => {
    cancelAddingNewLink();
    append(
      {
        $id: link.$id,
        entityTypes: [],
        minValue: 0,
        maxValue: 1,
        infinity: true,
        array: true,
      },
      { shouldFocus: false },
    );
  };

  const handleSubmit = async (data: TypeFormDefaults) => {
    const res = await createEntityType({
      data: {
        entityType: formDataToEntityType(data),
      },
    });

    if (res.errors?.length || !res.data) {
      // @todo handle this
      throw new Error("Could not create");
    }

    await refetchEntityTypes();

    handleAddEntityType(res.data.schema);
  };

  // @todo loading state
  if (!linkEntityTypes) {
    return null;
  }

  if (!addingNewLink && fields.length === 0) {
    return (
      <EmptyListCard
        onClick={() => {
          setAddingNewLink(true, () => {
            addingNewLinkRef.current?.focus();
          });
        }}
        icon={<LinkIcon />}
        headline={<>Add a link</>}
        description={
          <>
            Links contain information about connections or relationships between
            different entities
          </>
        }
        subDescription={
          <>
            e.g. a <strong>company</strong> entity might have a{" "}
            <strong>CEO</strong> link which points to a <strong>person</strong>{" "}
            entity
          </>
        }
      />
    );
  }

  return (
    <EntityTypeTable>
      <TableHead>
        <EntityTypeTableHeaderRow>
          <TableCell width={260}>Link name</TableCell>
          <TableCell sx={{ minWidth: 262 }}>
            Expected entity types{" "}
            <QuestionIcon tooltip="When specified, only entities whose types are listed in this column will be able to be associated with a link" />
          </TableCell>
          <EntityTypeTableCenteredCell width={200}>
            Allowed number of links{" "}
            <QuestionIcon tooltip="Require entities to specify a minimum or maximum number of links. A minimum value of 1 or more means that a link is required." />
          </EntityTypeTableCenteredCell>
          <TableCell width={TYPE_MENU_CELL_WIDTH} />
        </EntityTypeTableHeaderRow>
      </TableHead>
      <TableBody>
        {fields.map((type, index) => (
          <LinkTypeRow
            key={type.id}
            linkIndex={index}
            onRemove={() => {
              remove(index);
            }}
            onUpdateVersion={(nextId) => {
              setValue(`links.${index}.$id`, nextId, {
                shouldDirty: true,
              });
            }}
          />
        ))}
      </TableBody>
      <TableFooter>
        {addingNewLink ? (
          <>
            <InsertLinkRow
              inputRef={addingNewLinkRef}
              onCancel={cancelAddingNewLink}
              onAdd={handleAddEntityType}
              searchText={searchText}
              onSearchTextChange={setSearchText}
              createModalPopupState={createModalPopupState}
            />
            <TypeFormModal
              as={LinkTypeForm}
              popupState={createModalPopupState}
              modalTitle={
                <>
                  Create new link
                  <QuestionIcon
                    sx={{
                      ml: 1.25,
                    }}
                    tooltip={
                      <>
                        You should only create a new link type if you can't find
                        an existing one which corresponds to the relationship
                        you're trying to capture.
                      </>
                    }
                  />
                </>
              }
              onSubmit={handleSubmit}
              submitButtonProps={{ children: <>Create new link</> }}
              getDefaultValues={() =>
                searchText.length ? { name: searchText } : {}
              }
            />
          </>
        ) : (
          <EntityTypeTableButtonRow
            icon={<StyledPlusCircleIcon />}
            onClick={() => {
              setAddingNewLink(true, () => {
                addingNewLinkRef.current?.focus();
              });
            }}
          >
            Add a link
          </EntityTypeTableButtonRow>
        )}
      </TableFooter>
    </EntityTypeTable>
  );
};
