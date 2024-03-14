import type {
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { extractBaseUrl } from "@blockprotocol/type-system/slim";
import { faList } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  PropertyTypeIcon,
  StyledPlusCircleIcon,
} from "@hashintel/design-system";
import { Box, Checkbox, TableBody, TableCell, TableHead } from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";

import type { EntityTypeEditorFormData } from "../shared/form-types";
import { useOntologyFunctions } from "../shared/ontology-functions-context";
import { usePropertyTypesOptions } from "../shared/property-types-options-context";
import { useIsReadonly } from "../shared/read-only-context";
import { linkEntityTypeUrl } from "../shared/urls";
import { getPropertyTypeSchema } from "./property-list-card/get-property-type-schema";
import { InheritedPropertyRow } from "./property-list-card/inherited-property-row";
import { PropertyRow } from "./property-list-card/property-row";
import { PropertyTypeForm } from "./property-list-card/property-type-form";
import { propertyTypeToFormDataExpectedValues } from "./property-list-card/property-type-to-form-data-expected-values";
import type { PropertyTypeFormValues } from "./property-list-card/shared/property-type-form-values";
import { EmptyListCard } from "./shared/empty-list-card";
import {
  EntityTypeTable,
  EntityTypeTableCenteredCell,
  EntityTypeTableFooter,
  EntityTypeTableFooterButton,
  EntityTypeTableHeaderRow,
  sortRows,
  useFlashRow,
} from "./shared/entity-type-table";
import type { TypeSelectorType } from "./shared/insert-property-field/type-selector";
import type { InsertTypeFieldProps } from "./shared/insert-type-field";
import { InsertTypeField } from "./shared/insert-type-field";
import { MultipleValuesCell } from "./shared/multiple-values-cell";
import { QuestionIcon } from "./shared/question-icon";
import { TypeFormModal } from "./shared/type-form";
import { TypeMenuCell } from "./shared/type-menu-cell";
import { useFilterTypeOptions } from "./shared/use-filter-type-options";
import { useInheritedValuesForCurrentDraft } from "./shared/use-inherited-values";
import { useStateCallback } from "./shared/use-state-callback";
import { useTypeVersions } from "./shared/use-type-versions";

export const REQUIRED_CELL_WIDTH = 100;

export const PropertyTypeRow = ({
  propertyIndex,
  onRemove,
  onUpdateVersion,
  flash,
}: {
  propertyIndex: number;
  onRemove: () => void;
  onUpdateVersion: (nextId: VersionedUrl) => void;
  flash: boolean;
}) => {
  const { control } = useFormContext<EntityTypeEditorFormData>();

  const [isRequired, isArray, propertyId] = useWatch({
    control,
    name: [
      `properties.${propertyIndex}.required`,
      `properties.${propertyIndex}.array`,
      `properties.${propertyIndex}.$id`,
    ],
  });

  const editModalId = useId();
  const editModalPopupState = usePopupState({
    variant: "popover",
    popupId: `edit-property-type-modal-${editModalId}`,
  });

  const onUpdateVersionRef = useRef(onUpdateVersion);
  useLayoutEffect(() => {
    onUpdateVersionRef.current = onUpdateVersion;
  });

  const propertyTypesOptions = usePropertyTypesOptions();
  const propertySchema = propertyTypesOptions[propertyId]?.schema;

  const ontologyFunctions = useOntologyFunctions();
  const isReadonly = useIsReadonly();

  const [currentVersion, latestVersion] = useTypeVersions(
    propertyId,
    propertyTypesOptions,
  );

  if (!propertySchema) {
    throw new Error(`Property type with ${propertyId} not found in options`);
  }

  const getDefaultValues = useCallback(() => {
    const [expectedValues, flattenedCustomExpectedValueList] =
      propertyTypeToFormDataExpectedValues(propertySchema);

    return {
      name: propertySchema.title,
      description: propertySchema.description,
      expectedValues,
      flattenedCustomExpectedValueList,
    };
  }, [propertySchema]);

  const editDisabledReason = useMemo(() => {
    const canEdit = ontologyFunctions?.canEditResource({
      kind: "property-type",
      resource: propertySchema,
    });

    return !canEdit?.allowed
      ? canEdit?.message
      : currentVersion !== latestVersion
        ? "Update the property type to the latest version to edit"
        : undefined;
  }, [ontologyFunctions, propertySchema, currentVersion, latestVersion]);

  return (
    <>
      <PropertyRow
        property={propertySchema}
        isArray={isArray}
        isRequired={isRequired}
        allowArraysTableCell={
          <MultipleValuesCell index={propertyIndex} variant="property" />
        }
        requiredTableCell={
          <EntityTypeTableCenteredCell width={REQUIRED_CELL_WIDTH}>
            <Controller
              render={({ field: { value, ...field } }) => (
                <Checkbox {...field} checked={value} />
              )}
              control={control}
              name={`properties.${propertyIndex}.required`}
            />
          </EntityTypeTableCenteredCell>
        }
        menuTableCell={
          <TypeMenuCell
            editButtonProps={bindTrigger(editModalPopupState)}
            onRemove={onRemove}
            typeId={propertySchema.$id}
            variant="property"
            editButtonDisabled={editDisabledReason}
          />
        }
        onUpdateVersion={onUpdateVersion}
        flash={flash}
      />

      {!isReadonly && ontologyFunctions ? (
        <TypeFormModal
          as={PropertyTypeForm}
          baseUrl={extractBaseUrl(propertyId)}
          popupState={editModalPopupState}
          modalTitle={<>Edit Property Type</>}
          onSubmit={async (data: PropertyTypeFormValues) => {
            const res = await ontologyFunctions.updatePropertyType({
              data: {
                propertyTypeId: propertyId,
                propertyType: getPropertyTypeSchema(data),
              },
            });

            if (!res.data) {
              throw new Error("Failed to update property type");
            }

            onUpdateVersionRef.current(res.data.schema.$id);

            editModalPopupState.close();
          }}
          submitButtonProps={{ children: <>Edit property type</> }}
          disabledFields={["name"]}
          getDefaultValues={getDefaultValues}
        />
      ) : null}
    </>
  );
};

const InsertPropertyField = (
  props: Omit<
    InsertTypeFieldProps<PropertyType & Pick<TypeSelectorType, "Icon">>,
    "options" | "variant"
  >,
) => {
  const { control } = useFormContext<EntityTypeEditorFormData>();
  const properties = useWatch({ control, name: "properties" });

  const propertyTypeOptions = usePropertyTypesOptions();
  const propertyTypeSchemas = useMemo(
    () =>
      Object.values(propertyTypeOptions).map((type) => ({
        ...type.schema,
        Icon: PropertyTypeIcon,
      })),
    [propertyTypeOptions],
  );

  const { properties: inheritedProperties } =
    useInheritedValuesForCurrentDraft();

  const filteredPropertyTypes = useFilterTypeOptions({
    typesToExclude: [
      ...properties,
      ...inheritedProperties,
      { $id: linkEntityTypeUrl },
    ],
    typeOptions: propertyTypeSchemas,
  });

  return (
    <InsertTypeField
      {...props}
      options={filteredPropertyTypes}
      variant="property type"
    />
  );
};

const propertyDefaultValues = (): PropertyTypeFormValues => ({
  expectedValues: [],
  flattenedCustomExpectedValueList: {},
  name: "",
  description: "",
});

export const PropertyListCard = () => {
  const { control, getValues, setValue } =
    useFormContext<EntityTypeEditorFormData>();
  const {
    fields: unsortedFields,
    append,
    remove,
  } = useFieldArray({
    control,
    name: "properties",
  });

  const propertyTypeOptions = usePropertyTypesOptions();

  const ontologyFunctions = useOntologyFunctions();

  const isReadonly = useIsReadonly();

  const { properties: inheritedProperties } =
    useInheritedValuesForCurrentDraft();

  const fields = useMemo(
    () =>
      sortRows(
        [...unsortedFields, ...inheritedProperties],
        (propertyId) => propertyTypeOptions[propertyId],
        (row) => row.schema.title,
      ),
    [inheritedProperties, propertyTypeOptions, unsortedFields],
  );

  const [addingNewProperty, setAddingNewProperty] = useStateCallback(false);
  const [searchText, setSearchText] = useState("");
  const addingNewPropertyRef = useRef<HTMLInputElement>(null);

  const modalTooltipId = useId();
  const createModalPopupState = usePopupState({
    variant: "popover",
    popupId: `createProperty-${modalTooltipId}`,
  });

  const cancelAddingNewProperty = () => {
    createModalPopupState.close();
    setAddingNewProperty(false);
    setSearchText("");
  };
  const [flashingRows, flashRow] = useFlashRow();

  const handleAddPropertyType = (propertyType: PropertyType) => {
    cancelAddingNewProperty();
    if (!getValues("properties").some(({ $id }) => $id === propertyType.$id)) {
      append({
        $id: propertyType.$id,
        required: false,
        array: false,
        minValue: 0,
        maxValue: 1,
        infinity: true,
      });
      flashRow(propertyType.$id);
    }
  };

  const handleSubmit = async (data: PropertyTypeFormValues) => {
    if (isReadonly || !ontologyFunctions) {
      return;
    }

    const res = await ontologyFunctions.createPropertyType({
      data: {
        propertyType: getPropertyTypeSchema(data),
      },
    });

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    if (res.errors?.length || !res.data) {
      // @todo handle this
      throw new Error("Could not create");
    }

    handleAddPropertyType(res.data.schema);
  };

  const propertyDirtyFields = useCallback(
    () => (searchText ? { name: searchText } : {}),
    [searchText],
  );

  if (!addingNewProperty && fields.length === 0) {
    return (
      <EmptyListCard
        onClick={
          isReadonly
            ? undefined
            : () => {
                setAddingNewProperty(true, () => {
                  addingNewPropertyRef.current?.focus();
                });
              }
        }
        icon={<FontAwesomeIcon icon={faList} sx={{ fontSize: 24 }} />}
        headline={isReadonly ? <>No properties defined</> : <>Add a property</>}
        description={
          <>
            Properties store individual pieces of information about some aspect
            of an entity
          </>
        }
        subDescription={
          <>
            e.g. a <strong>person</strong> entity might have a{" "}
            <strong>date of birth</strong> property which expects a{" "}
            <strong>date</strong>
          </>
        }
      />
    );
  }

  return (
    <EntityTypeTable>
      <TableHead>
        <EntityTypeTableHeaderRow>
          <TableCell>Property name</TableCell>
          <TableCell>Expected values</TableCell>
          <EntityTypeTableCenteredCell>
            Allow multiple{" "}
            <QuestionIcon
              tooltip={
                <>
                  Allowing multiple permits the entry of more than one value for
                  a given property
                </>
              }
            />
          </EntityTypeTableCenteredCell>
          <EntityTypeTableCenteredCell>Required</EntityTypeTableCenteredCell>
          <TableCell />
        </EntityTypeTableHeaderRow>
      </TableHead>
      <TableBody>
        {fields.map(({ field, index }) =>
          "inheritanceChain" in field ? (
            <InheritedPropertyRow
              key={field.$id}
              inheritedPropertyData={field}
            />
          ) : (
            <PropertyTypeRow
              key={field.id}
              propertyIndex={index}
              onRemove={() => {
                remove(index);
              }}
              onUpdateVersion={(nextId) => {
                setValue(`properties.${index}.$id`, nextId, {
                  shouldDirty: true,
                });
              }}
              flash={flashingRows.includes(field.$id)}
            />
          ),
        )}
      </TableBody>
      {isReadonly ? (
        <Box sx={{ height: "var(--table-padding)" }} />
      ) : (
        <EntityTypeTableFooter enableShadow={fields.length > 0}>
          {addingNewProperty ? (
            <>
              <InsertPropertyField
                inputRef={addingNewPropertyRef}
                onCancel={cancelAddingNewProperty}
                onAdd={handleAddPropertyType}
                createModalPopupState={createModalPopupState}
                searchText={searchText}
                onSearchTextChange={setSearchText}
              />
              <TypeFormModal
                as={PropertyTypeForm}
                modalTitle={
                  <>
                    Create new property type
                    <QuestionIcon
                      sx={{
                        display: "flex",
                        ml: 1.25,
                      }}
                      tooltip={
                        <>
                          You should only create a new property type if you
                          can't find an existing one which corresponds to the
                          information you're trying to capture.
                        </>
                      }
                    />
                  </>
                }
                popupState={createModalPopupState}
                onSubmit={handleSubmit}
                submitButtonProps={{ children: <>Create new property type</> }}
                getDefaultValues={propertyDefaultValues}
                getDirtyFields={propertyDirtyFields}
              />
            </>
          ) : (
            <EntityTypeTableFooterButton
              icon={<StyledPlusCircleIcon />}
              onClick={() => {
                setAddingNewProperty(true, () => {
                  addingNewPropertyRef.current?.focus();
                });
              }}
            >
              Add a property
            </EntityTypeTableFooterButton>
          )}
        </EntityTypeTableFooter>
      )}
    </EntityTypeTable>
  );
};
