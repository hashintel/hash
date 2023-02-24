import { EntityType, VersionedUrl } from "@blockprotocol/type-system/slim";
import { LinkIcon, StyledPlusCircleIcon } from "@hashintel/design-system";
import {
  Box,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
} from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";

import { useEntityTypesOptions } from "../shared/entity-types-options-context";
import { EntityTypeEditorFormData } from "../shared/form-types";
import { useOntologyFunctions } from "../shared/ontology-functions-context";
import { useIsReadonly } from "../shared/read-only-context";
import { linkEntityTypeUrl } from "../shared/urls";
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
import { Link } from "./shared/link";
import { MultipleValuesCell } from "./shared/multiple-values-cell";
import { QuestionIcon } from "./shared/question-icon";
import {
  TypeForm,
  TypeFormDefaults,
  TypeFormModal,
  TypeFormProps,
} from "./shared/type-form";
import { TYPE_MENU_CELL_WIDTH, TypeMenuCell } from "./shared/type-menu-cell";
import { useFilterTypeOptions } from "./shared/use-filter-type-options";
import { useStateCallback } from "./shared/use-state-callback";
import { useTypeVersions } from "./shared/use-type-versions";
import { VersionUpgradeIndicator } from "./shared/version-upgrade-indicator";

const formDataToEntityType = (data: TypeFormDefaults) => ({
  type: "object" as const,
  kind: "entityType" as const,
  title: data.name,
  description: data.description,
  allOf: [
    {
      $ref: linkEntityTypeUrl,
    },
  ],
  properties: {},
  additionalProperties: false,
});

export const LinkTypeForm = (props: TypeFormProps) => {
  const { validateTitle: remoteValidation } = useOntologyFunctions();

  const validateTitle = async (title: string) =>
    remoteValidation({
      kind: "entity-type",
      title,
    });

  return <TypeForm validateTitle={validateTitle} {...props} />;
};

const LinkTypeRow = ({
  linkIndex,
  onRemove,
  onUpdateVersion,
  flash,
}: {
  linkIndex: number;
  onRemove: () => void;
  onUpdateVersion: (nextId: VersionedUrl) => void;
  flash: boolean;
}) => {
  const isReadonly = useIsReadonly();

  const { updateEntityType } = useOntologyFunctions();

  const editModalPopupId = useId();
  const editModalPopupState = usePopupState({
    variant: "popover",
    popupId: `editLink-${editModalPopupId}`,
  });

  const { control } = useFormContext<EntityTypeEditorFormData>();

  const { linkTypes } = useEntityTypesOptions();
  const linkId = useWatch({
    control,
    name: `links.${linkIndex}.$id`,
  });

  const link = linkTypes[linkId];

  const [currentVersion, latestVersion, baseUrl] = useTypeVersions(
    linkId,
    linkTypes,
  );

  if (!link) {
    throw new Error(`Link entity type with ${linkId} not found in options`);
  }

  const onUpdateVersionRef = useRef(onUpdateVersion);
  useLayoutEffect(() => {
    onUpdateVersionRef.current = onUpdateVersion;
  });

  const handleSubmit = async (data: TypeFormDefaults) => {
    if (isReadonly) {
      return;
    }

    const res = await updateEntityType({
      data: {
        entityTypeId: link.$id,
        entityType: formDataToEntityType(data),
      },
    });

    if (!res.data) {
      throw new Error("Failed to update entity type");
    }

    onUpdateVersionRef.current(res.data.schema.$id);

    editModalPopupState.close();
  };

  return (
    <>
      <EntityTypeTableRow flash={flash}>
        <TableCell>
          <EntityTypeTableTitleCellText>
            <Link href={link.$id} style={{ color: "inherit", fontWeight: 600 }}>
              {link.title}
            </Link>
            {currentVersion !== latestVersion && !isReadonly ? (
              <Box ml={1}>
                <VersionUpgradeIndicator
                  currentVersion={currentVersion}
                  latestVersion={latestVersion}
                  onUpdateVersion={() => {
                    if (latestVersion) {
                      onUpdateVersion(`${baseUrl}v/${latestVersion}`);
                    }
                  }}
                />
              </Box>
            ) : null}
          </EntityTypeTableTitleCellText>
        </TableCell>
        <TableCell sx={{ py: "0 !important" }}>
          <LinkEntityTypeSelector linkIndex={linkIndex} />
        </TableCell>
        <MultipleValuesCell index={linkIndex} variant="link" />
        <TypeMenuCell
          typeId={link.$id}
          editButtonProps={bindTrigger(editModalPopupState)}
          {...(currentVersion !== latestVersion
            ? {
                editButtonDisabled:
                  "Update the link type to the latest version to edit",
              }
            : {})}
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
          name: link.title,
          description: link.description,
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
  const { control } = useFormContext<EntityTypeEditorFormData>();
  const links = useWatch({ control, name: "links" });

  const { linkTypes: linkTypeOptions } = useEntityTypesOptions();
  const linkTypes = Object.values(linkTypeOptions);

  const filteredLinkTypes = useFilterTypeOptions({
    typesToExclude: links,
    typeOptions: linkTypes,
  });

  return (
    <InsertTypeRow {...props} options={filteredLinkTypes} variant="link" />
  );
};

export const LinkListCard = () => {
  const { control, setValue } = useFormContext<EntityTypeEditorFormData>();
  const {
    fields: unsortedFields,
    append,
    remove,
  } = useFieldArray({ control, name: "links" });
  const { linkTypes } = useEntityTypesOptions();

  const { createEntityType } = useOntologyFunctions();

  const isReadonly = useIsReadonly();

  const fields = useMemo(
    () =>
      sortRows(
        unsortedFields,
        (linkId) => linkTypes[linkId],
        (row) => row.title,
      ),
    [linkTypes, unsortedFields],
  );

  const [flashingRows, flashRow] = useFlashRow();

  const [addingNewLink, setAddingNewLink] = useStateCallback(false);
  const addingNewLinkRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");
  const modalId = useId();
  const createModalPopupState = usePopupState({
    variant: "popover",
    popupId: `createLink-${modalId}`,
  });

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
    if (isReadonly) {
      return;
    }

    const res = await createEntityType({
      data: {
        entityType: formDataToEntityType(data),
      },
    });

    if (res.errors?.length || !res.data) {
      // @todo handle this
      throw new Error("Could not create");
    }

    handleAddEntityType(res.data.schema);
  };

  if (!addingNewLink && fields.length === 0) {
    return (
      <EmptyListCard
        onClick={
          isReadonly
            ? undefined
            : () => {
                setAddingNewLink(true, () => {
                  addingNewLinkRef.current?.focus();
                });
              }
        }
        icon={<LinkIcon />}
        headline={isReadonly ? <>No links defined</> : <>Add a link</>}
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
            flash={row ? flashingRows.includes(row.$id) : false}
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
          !isReadonly && (
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
          )
        )}
      </TableFooter>
    </EntityTypeTable>
  );
};
