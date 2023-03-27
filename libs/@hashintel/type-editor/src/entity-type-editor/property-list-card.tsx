import {
  extractBaseUrl,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system/slim";
import { faList } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  StyledPlusCircleIcon,
} from "@hashintel/design-system";
import {
  Box,
  Checkbox,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { bindTrigger, usePopupState } from "material-ui-popup-state/hooks";
import {
  ReactNode,
  useCallback,
  useEffect,
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

import { EntityTypeEditorFormData } from "../shared/form-types";
import { useOntologyFunctions } from "../shared/ontology-functions-context";
import { usePropertyTypesOptions } from "../shared/property-types-options-context";
import { useIsReadonly } from "../shared/read-only-context";
import { DisabledCheckboxCell } from "./property-list-card/disabled-checkbox-cell";
import { getPropertyTypeSchema } from "./property-list-card/get-property-type-schema";
import { PropertyExpectedValues } from "./property-list-card/property-expected-values";
import { PropertyTitleCell } from "./property-list-card/property-title-cell";
import { PropertyTypeForm } from "./property-list-card/property-type-form";
import { propertyTypeToFormDataExpectedValues } from "./property-list-card/property-type-to-form-data-expected-values";
import { PropertyTypeFormValues } from "./property-list-card/shared/property-type-form-values";
import { CollapsibleRowLine } from "./shared/collapsible-row-line";
import { EmptyListCard } from "./shared/empty-list-card";
import {
  EntityTypeTable,
  EntityTypeTableCenteredCell,
  EntityTypeTableFooter,
  EntityTypeTableFooterButton,
  EntityTypeTableHeaderRow,
  EntityTypeTableRow,
  sortRows,
  useFlashRow,
} from "./shared/entity-type-table";
import {
  InsertTypeField,
  InsertTypeFieldProps,
} from "./shared/insert-type-field";
import {
  MULTIPLE_VALUES_CELL_WIDTH,
  MultipleValuesCell,
} from "./shared/multiple-values-cell";
import { QuestionIcon } from "./shared/question-icon";
import { TypeFormModal } from "./shared/type-form";
import { TypeMenuCell } from "./shared/type-menu-cell";
import { useFilterTypeOptions } from "./shared/use-filter-type-options";
import { useStateCallback } from "./shared/use-state-callback";
import { useTypeVersions } from "./shared/use-type-versions";

const CollapsibleTableRow = ({
  expanded,
  depth,
  lineHeight,
  children,
}: {
  expanded: boolean;
  depth: number;
  lineHeight: number;
  children: ReactNode;
}) => {
  return (
    <TableRow>
      <TableCell colSpan={12} sx={{ p: "0 !important", position: "relative" }}>
        <Collapse
          in={expanded}
          sx={{
            position: "relative",
            top: `-${lineHeight}px`,
            mb: `-${lineHeight}px`,
            pointerEvents: "none",
          }}
          appear
        >
          <CollapsibleRowLine height={`${lineHeight}px`} depth={depth} />

          <Table sx={{ mt: `${lineHeight}px`, pointerEvents: "all" }}>
            <TableBody
              sx={{
                "::before": {
                  height: 0,
                },
              }}
            >
              {children}
            </TableBody>
          </Table>
        </Collapse>
      </TableCell>
    </TableRow>
  );
};

export const REQUIRED_CELL_WIDTH = 100;

const PropertyRow = ({
  property,
  isArray,
  isRequired,
  depth = 0,
  lines = [],
  parentPropertyName,
  allowArraysTableCell,
  requiredTableCell,
  menuTableCell,
  onUpdateVersion,
  flash = false,
}: {
  property: PropertyType;
  isArray: boolean;
  isRequired: boolean;
  depth?: number;
  lines?: boolean[];
  parentPropertyName?: string;
  allowArraysTableCell?: ReactNode;
  requiredTableCell?: ReactNode;
  menuTableCell?: ReactNode;
  onUpdateVersion?: (nextId: VersionedUrl) => void;
  flash?: boolean;
}) => {
  const propertyTypesOptions = usePropertyTypesOptions();

  const isReadonly = useIsReadonly();

  const [currentVersion, latestVersion, baseUrl] = useTypeVersions(
    property.$id,
    propertyTypesOptions,
  );

  const [expanded, setExpanded] = useState(true);

  const mainRef = useRef<HTMLTableRowElement | null>(null);
  const [lineHeight, setLineHeight] = useState(0);

  const [animatingOutExpectedValue, setAnimatingOutExpectedValue] =
    useState(false);
  const [selectedExpectedValueIndex, setSelectedExpectedValueIndex] =
    useState(-1);

  const children = useMemo(() => {
    const selectedProperty = property.oneOf[selectedExpectedValueIndex]
      ? property.oneOf[selectedExpectedValueIndex]
      : null;

    const selectedObjectProperties =
      selectedProperty && "properties" in selectedProperty
        ? selectedProperty.properties
        : undefined;

    return selectedObjectProperties
      ? Object.entries(selectedObjectProperties).reduce(
          (
            childrenArray: ({
              array: boolean;
              required: boolean;
            } & PropertyType)[],
            [propertyId, ref],
          ) => {
            const $ref = "items" in ref ? ref.items.$ref : ref.$ref;
            const propertyType = propertyTypesOptions[$ref];

            if (propertyType) {
              const array = "type" in ref;
              const required = Boolean(
                selectedProperty &&
                  "required" in selectedProperty &&
                  selectedProperty.required?.includes(propertyId),
              );
              return [...childrenArray, { ...propertyType, array, required }];
            }

            return childrenArray;
          },
          [],
        )
      : [];
  }, [selectedExpectedValueIndex, property.oneOf, propertyTypesOptions]);

  const handleResize = () => {
    if (mainRef.current) {
      setLineHeight(mainRef.current.offsetHeight * 0.5 - 8);
    }
  };

  useEffect(() => {
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <>
      <EntityTypeTableRow
        ref={(row: HTMLTableRowElement | null) => {
          if (row) {
            mainRef.current = row;
            handleResize();
          }
        }}
        flash={flash}
      >
        <PropertyTitleCell
          property={property}
          array={isArray}
          depth={depth}
          lines={lines}
          expanded={children.length ? expanded : undefined}
          setExpanded={setExpanded}
          currentVersion={currentVersion}
          latestVersion={latestVersion}
          onUpdateVersion={() => {
            if (latestVersion) {
              onUpdateVersion?.(`${baseUrl}v/${latestVersion}`);
            }
          }}
        />

        <TableCell>
          <PropertyExpectedValues
            property={property}
            selectedExpectedValueIndex={selectedExpectedValueIndex}
            setSelectedExpectedValueIndex={(value) => {
              setSelectedExpectedValueIndex(value);
              setExpanded(true);
            }}
            setAnimatingOutExpectedValue={setAnimatingOutExpectedValue}
          />
        </TableCell>

        {allowArraysTableCell && !isReadonly && !parentPropertyName ? (
          allowArraysTableCell
        ) : (
          <DisabledCheckboxCell
            title={
              isReadonly
                ? undefined
                : `Edit the '${
                    parentPropertyName ?? "parent"
                  }' property to change this`
            }
            checked={isArray}
            width={MULTIPLE_VALUES_CELL_WIDTH}
            sx={{ pr: 1 }}
          />
        )}

        {requiredTableCell && !isReadonly && !parentPropertyName ? (
          requiredTableCell
        ) : (
          <DisabledCheckboxCell
            title={
              isReadonly
                ? undefined
                : `Edit the '${
                    parentPropertyName ?? "parent"
                  }' property to change this`
            }
            checked={isRequired}
            width={REQUIRED_CELL_WIDTH}
          />
        )}

        {menuTableCell ?? (
          <TypeMenuCell
            typeId={property.$id}
            variant="property"
            editable={false}
          />
        )}
      </EntityTypeTableRow>

      {children.length ? (
        <CollapsibleTableRow
          expanded={expanded && !animatingOutExpectedValue}
          depth={depth}
          lineHeight={lineHeight}
        >
          {children.map((prop, pos) => (
            <PropertyRow
              key={prop.$id}
              property={prop}
              depth={depth + 1}
              lines={[...lines, pos !== children.length - 1]}
              isArray={prop.array}
              isRequired={prop.required}
              parentPropertyName={property.title}
            />
          ))}
        </CollapsibleTableRow>
      ) : null}
    </>
  );
};

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
  const property = propertyTypesOptions[propertyId];

  const { updatePropertyType } = useOntologyFunctions();

  const [currentVersion, latestVersion] = useTypeVersions(
    propertyId,
    propertyTypesOptions,
  );

  const getDefaultValues = useCallback(() => {
    if (!property) {
      throw new Error("Missing property type");
    }

    const [expectedValues, flattenedCustomExpectedValueList] =
      propertyTypeToFormDataExpectedValues(property);

    return {
      name: property.title,
      description: property.description,
      expectedValues,
      flattenedCustomExpectedValueList,
    };
  }, [property]);

  if (!property) {
    return null;
  }

  const $id = property.$id;

  return (
    <>
      <PropertyRow
        property={property}
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
            typeId={property.$id}
            variant="property"
            {...(currentVersion !== latestVersion
              ? {
                  editButtonDisabled:
                    "Update the property type to the latest version to edit",
                }
              : {})}
          />
        }
        onUpdateVersion={onUpdateVersion}
        flash={flash}
      />

      <TypeFormModal
        as={PropertyTypeForm}
        baseUrl={extractBaseUrl($id)}
        popupState={editModalPopupState}
        modalTitle={<>Edit Property Type</>}
        onSubmit={async (data: PropertyTypeFormValues) => {
          const res = await updatePropertyType({
            data: {
              propertyTypeId: $id,
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
    </>
  );
};

const InsertPropertyField = (
  props: Omit<InsertTypeFieldProps<PropertyType>, "options" | "variant">,
) => {
  const { control } = useFormContext<EntityTypeEditorFormData>();
  const properties = useWatch({ control, name: "properties" });

  const propertyTypeOptions = usePropertyTypesOptions();
  const propertyTypes = Object.values(propertyTypeOptions);

  const filteredPropertyTypes = useFilterTypeOptions({
    typesToExclude: properties,
    typeOptions: propertyTypes,
  });

  return (
    <InsertTypeField
      {...props}
      options={filteredPropertyTypes}
      variant="property"
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

  const { createPropertyType } = useOntologyFunctions();

  const isReadonly = useIsReadonly();

  const fields = useMemo(
    () =>
      sortRows(
        unsortedFields,
        (propertyId) => propertyTypeOptions[propertyId],
        (row) => row.title,
      ),
    [propertyTypeOptions, unsortedFields],
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
    if (isReadonly) {
      return;
    }

    const res = await createPropertyType({
      data: {
        propertyType: getPropertyTypeSchema(data),
      },
    });

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
        icon={<FontAwesomeIcon icon={faList} />}
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
        {fields.map(({ field, index }) => (
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
        ))}
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
                  getDirtyFields={propertyDirtyFields
                }
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
