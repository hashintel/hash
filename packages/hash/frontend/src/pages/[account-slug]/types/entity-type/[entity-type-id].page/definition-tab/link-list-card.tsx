import { EntityType } from "@blockprotocol/type-system";
import { Chip } from "@hashintel/hash-design-system";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { TableBody, TableCell, TableFooter, TableHead } from "@mui/material";
import { usePopupState } from "material-ui-popup-state/hooks";
import { useId, useRef, useState } from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { useBlockProtocolGetEntityType } from "../../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { LinkIcon } from "../../../../../../shared/icons/link";
import { HashSelectorAutocomplete } from "../../../../shared/hash-selector-autocomplete";
import { StyledPlusCircleIcon } from "../../../../shared/styled-plus-circle-icon";
import {
  useEntityTypes,
  useEntityTypesLoading,
  useLinkEntityTypes,
} from "../shared/entity-types-context";
import { EntityTypeEditorForm } from "../shared/form-types";
import { EmptyListCard } from "./shared/empty-list-card";
import {
  EntityTypeTable,
  EntityTypeTableButtonRow,
  EntityTypeTableHeaderRow,
  EntityTypeTableRow,
  EntityTypeTableTitleCellText,
} from "./shared/entity-type-table";
import { InsertTypeRow, InsertTypeRowProps } from "./shared/insert-type-row";
import { QuestionIcon } from "./shared/question-icon";
import {
  generateInitialTypeUri,
  GenericTypeForm,
  GenericTypeFormProps,
  TypeFormModal,
  useGenerateTypeBaseUri,
} from "./shared/type-form";
import { TYPE_MENU_CELL_WIDTH, TypeMenuCell } from "./shared/type-menu-cell";
import { useStateCallback } from "./shared/use-state-callback";

const LinkTypeRow = ({
  linkIndex,
  onRemove,
}: {
  linkIndex: number;
  onRemove: () => void;
}) => {
  const { control, register, setValue } =
    useFormContext<EntityTypeEditorForm>();
  const linkTypes = useLinkEntityTypes();
  const entityTypes = useEntityTypes();
  // @todo watch more specific
  const linkData = useWatch({
    control,
    name: `links.${linkIndex}`,
  });

  const link = linkTypes[linkData.$id];

  const popupId = useId();
  const menuPopupState = usePopupState({
    variant: "popover",
    popupId: `property-menu-${popupId}`,
  });

  if (!link) {
    throw new Error("Missing link");
  }

  return (
    <EntityTypeTableRow>
      <TableCell>
        <EntityTypeTableTitleCellText>
          {link.schema.title}
        </EntityTypeTableTitleCellText>
      </TableCell>
      <TableCell>
        <Controller
          name={`links.${linkIndex}.entityTypes`}
          control={control}
          render={({ field: { onChange, value, ref } }) => (
            <HashSelectorAutocomplete
              autoFocus={false}
              onChange={(evt, chosenTypes) => {
                if (
                  chosenTypes.length === 0 &&
                  evt.target !== document.activeElement
                ) {
                  onRemove();
                } else {
                  onChange(chosenTypes.map((type) => type.$id));
                }
              }}
              onBlur={() => {
                if (!value.length) {
                  onRemove();
                }
              }}
              value={
                // @todo tidy
                value.map(($id) => entityTypes[$id]!.schema)
              }
              options={Object.values(entityTypes).map((type) => type.schema)}
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
              multiple
              disableCloseOnSelect
              renderTags={(tags, getTagProps) => {
                return tags.map((tag, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    color="blue"
                    label={tag.title}
                    key={tag.$id}
                  />
                ));
              }}
              inputRef={ref}
            />
          )}
        />
      </TableCell>
      <TableCell>
        <input
          type="number"
          {...register(`links.${linkIndex}.minValue`, {
            valueAsNumber: true,
            onChange(evt) {
              const value = evt.target.value;
              if (value > linkData.maxValue) {
                setValue(`links.${linkIndex}.maxValue`, value, {
                  shouldDirty: true,
                });
              }
            },
          })}
          min={0}
        />
        <input
          type="number"
          {...register(`links.${linkIndex}.maxValue`, {
            valueAsNumber: true,
            onChange(evt) {
              const value = evt.target.value;
              if (value < linkData.minValue) {
                setValue(`links.${linkIndex}.minValue`, value, {
                  shouldDirty: true,
                });
              }
            },
          })}
          min={1}
        />
      </TableCell>
      <TypeMenuCell
        typeId={linkData.$id}
        editButtonProps={{}}
        popupState={menuPopupState}
        variant="link"
        onRemove={onRemove}
        canEdit={false}
      />
    </EntityTypeTableRow>
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

export const LinkTypeForm = (props: GenericTypeFormProps) => {
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

    return !res.data || !!getEntityTypeById(res.data, entityTypeId);
  };

  return <GenericTypeForm nameExists={nameExists} {...props} />;
};

export const LinkListCard = () => {
  const { control } = useFormContext<EntityTypeEditorForm>();
  const { fields, append, remove } = useFieldArray({ control, name: "links" });
  const loading = useEntityTypesLoading();

  const [addingNewLink, setAddingNewLink] = useStateCallback(false);
  const addingNewLinkRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");
  const modalTooltipId = useId();
  const createModalPopupState = usePopupState({
    variant: "popover",
    popupId: `createLink-${modalTooltipId}`,
  });

  const cancelAddingNewLink = () => {
    setAddingNewLink(false);
    setSearchText("");
  };

  // @todo loading state
  if (loading) {
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
          <TableCell>Link name</TableCell>
          <TableCell>
            Expected entity types <QuestionIcon />
          </TableCell>
          <TableCell>
            Allowed number of links <QuestionIcon />
          </TableCell>
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
          />
        ))}
      </TableBody>
      <TableFooter>
        {addingNewLink ? (
          <>
            <InsertLinkRow
              inputRef={addingNewLinkRef}
              onCancel={cancelAddingNewLink}
              onAdd={(link) => {
                cancelAddingNewLink();
                append(
                  {
                    $id: link.$id,
                    entityTypes: [],
                    minValue: 0,
                    maxValue: 1,
                  },
                  { focusName: `links.${fields.length}.entityTypes` },
                );
              }}
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
                  />
                </>
              }
              onSubmit={async (values) => {
                console.log(values);
              }}
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
