import { EntityType, VersionedUri } from "@blockprotocol/type-system";
import { OwnedById } from "@local/hash-isomorphic-utils/types";
import {
  EntityTypeWithMetadata,
  linkEntityTypeUri,
} from "@local/hash-subgraph";
import { getEntityTypeById } from "@local/hash-subgraph/src/stdlib/element/entity-type";
import { TableBody, TableCell, TableFooter, TableHead } from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { useBlockProtocolCreateEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-create-entity-type";
import { useBlockProtocolGetEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { useBlockProtocolUpdateEntityType } from "../../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-update-entity-type";
import {
  useFetchEntityTypes,
  useLinkEntityTypes,
  useLinkEntityTypesOptional,
} from "../../../../../../shared/entity-types-context/hooks";
import { LinkIcon } from "../../../../../../shared/icons/link";
import { StyledPlusCircleIcon } from "../../../../shared/styled-plus-circle-icon";
import { useRouteNamespace } from "../../../../shared/use-route-namespace";
import { EntityTypeEditorForm } from "../shared/form-types";
import { LinkEntityTypeSelector } from "./link-list-card/link-entity-type-selector";
import { EmptyListCard } from "./shared/empty-list-card";
import {
  EntityTypeTable,
  EntityTypeTableButtonRow,
  EntityTypeTableCenteredCell,
  EntityTypeTableHeaderRow,
  EntityTypeTableRow,
  EntityTypeTableTitleCellText,
  sortRows,
  useFlashRow,
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
  link,
  onRemove,
  onUpdateVersion,
  flash,
}: {
  linkIndex: number;
  link: EntityTypeWithMetadata | undefined;
  onRemove: () => void;
  onUpdateVersion: (nextId: VersionedUri) => void;
  flash: boolean;
}) => {
  if (!link) {
    throw new Error("Missing link");
  }

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
        entityTypeId: link.schema.$id,
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

  return (
    <>
      <EntityTypeTableRow flash={flash}>
        <TableCell>
          <EntityTypeTableTitleCellText>
            {link.schema.title}
          </EntityTypeTableTitleCellText>
        </TableCell>
        <TableCell sx={{ py: "0 !important" }}>
          <LinkEntityTypeSelector linkIndex={linkIndex} />
        </TableCell>
        <MultipleValuesCell index={linkIndex} variant="link" />
        <TypeMenuCell
          typeId={link.schema.$id}
          editButtonProps={bindTrigger(editModalPopupState)}
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
  const {
    fields: unsortedFields,
    append,
    remove,
  } = useFieldArray({ control, name: "links" });
  const linkTypes = useLinkEntityTypes();

  const fields = useMemo(
    () =>
      sortRows(
        unsortedFields,
        (linkId) => linkTypes[linkId],
        (row) => row.schema.title,
      ),
    [linkTypes, unsortedFields],
  );

  const [flashingRows, flashRow] = useFlashRow();

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
    flashRow(link.$id);
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
        {fields.map(({ field, row, index }) => (
          <LinkTypeRow
            key={field.id}
            linkIndex={index}
            onRemove={() => {
              remove(index);
            }}
            onUpdateVersion={(nextId) => {
              setValue(`links.${index}.$id`, nextId, {
                shouldDirty: true,
              });
            }}
            link={row}
            flash={row ? flashingRows.includes(row.schema.$id) : false}
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
