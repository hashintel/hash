import {
  extractBaseUri,
  extractVersion,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system";
import { faList } from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  StyledPlusCircleIcon,
} from "@hashintel/design-system";
import {
  Box,
  Checkbox,
  checkboxClasses,
  Collapse,
  svgIconClasses,
  Table,
  TableBody,
  TableCell,
  TableCellProps,
  TableFooter,
  TableHead,
  TableRow,
  Tooltip,
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
import {
  PropertyTypesByVersionedUri,
  usePropertyTypesOptions,
} from "../shared/property-types-options-context";
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
  EntityTypeTableButtonRow,
  EntityTypeTableCenteredCell,
  EntityTypeTableHeaderRow,
  EntityTypeTableRow,
  sortRows,
  useFlashRow,
} from "./shared/entity-type-table";
import { InsertTypeRow, InsertTypeRowProps } from "./shared/insert-type-row";
import {
  MULTIPLE_VALUES_CELL_WIDTH,
  MultipleValuesCell,
} from "./shared/multiple-values-cell";
import { QuestionIcon } from "./shared/question-icon";
import { TypeFormModal } from "./shared/type-form";
import { TypeMenuCell } from "./shared/type-menu-cell";
import { useStateCallback } from "./shared/use-state-callback";

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

const DisabledCheckboxCell = ({
  title,
  checked,
  width,
  sx,
}: {
  title: string;
  checked?: boolean;
  width: number;
} & TableCellProps) => {
  return (
    <EntityTypeTableCenteredCell width={width}>
      <Tooltip title={title} placement="top" disableInteractive>
        <Box
          sx={[
            {
              boxSizing: "content-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            },
            ...(Array.isArray(sx) ? sx : [sx]),
          ]}
        >
          <Checkbox
            disabled
            checked={checked}
            sx={[
              {
                color: ({ palette }) => `${palette.gray[40]} !important`,
                [`.${svgIconClasses.root}`]: {
                  color: "inherit",
                },
                [`&.${checkboxClasses.checked}.${checkboxClasses.disabled}`]: {
                  color: ({ palette }) => `${palette.blue[30]} !important`,
                },
              },
            ]}
          />
        </Box>
      </Tooltip>
    </EntityTypeTableCenteredCell>
  );
};

const usePropertyTypeVersions = (
  propertyTypeId: VersionedUri,
  propertyTypeOptions?: PropertyTypesByVersionedUri,
) => {
  return useMemo(() => {
    const baseUri = extractBaseUri(propertyTypeId);

    const versions = Object.values(propertyTypeOptions ?? {}).filter(
      (propertyType) => extractBaseUri(propertyType.$id),
    );

    const latestVersion = Math.max(
      ...versions.map((version) => extractVersion(version.$id)),
    );

    return [
      extractVersion(propertyTypeId),
      latestVersion,
      baseUri.slice(0, -1),
    ] as const;
  }, [propertyTypeId, propertyTypeOptions]);
};

const REQUIRED_CELL_WIDTH = 100;

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
  isRequired?: boolean;
  depth?: number;
  lines?: boolean[];
  parentPropertyName?: string;
  allowArraysTableCell?: ReactNode;
  requiredTableCell?: ReactNode;
  menuTableCell?: ReactNode;
  onUpdateVersion?: (nextId: VersionedUri) => void;
  flash?: boolean;
}) => {
  const propertyTypesOptions = usePropertyTypesOptions();

  const [currentVersion, latestVersion, baseUri] = usePropertyTypeVersions(
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
          onVersionUpdate={() => {
            if (latestVersion) {
              onUpdateVersion?.(`${baseUri}/v/${latestVersion}`);
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

        {allowArraysTableCell ?? (
          <DisabledCheckboxCell
            title={`Edit the '${
              parentPropertyName ?? "parent"
            }' property to change this`}
            checked={isArray}
            width={MULTIPLE_VALUES_CELL_WIDTH}
            sx={{ pr: 1 }}
          />
        )}

        {requiredTableCell ?? (
          <DisabledCheckboxCell
            title={`Edit the '${
              parentPropertyName ?? "parent"
            }' property to change this`}
            checked={isRequired}
            width={REQUIRED_CELL_WIDTH}
          />
        )}

        {menuTableCell ?? (
          <TypeMenuCell
            typeId={property.$id}
            variant="property"
            canEdit={false}
            canRemove={false}
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
  property,
  propertyId,
  onRemove,
  onUpdateVersion,
  flash,
}: {
  propertyIndex: number;
  property: PropertyType | undefined;
  propertyId: VersionedUri;
  onRemove: () => void;
  onUpdateVersion: (nextId: VersionedUri) => void;
  flash: boolean;
}) => {
  const { control } = useFormContext<EntityTypeEditorFormData>();

  const array = useWatch({
    control,
    name: `properties.${propertyIndex}.array`,
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

  const { updatePropertyType } = useOntologyFunctions();

  const [currentVersion, latestVersion] = usePropertyTypeVersions(
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
        isArray={array}
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
        baseUri={extractBaseUri($id)}
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

const InsertPropertyRow = (
  props: Omit<InsertTypeRowProps<PropertyType>, "options" | "variant">,
) => {
  const { control } = useFormContext<EntityTypeEditorFormData>();
  const properties = useWatch({ control, name: "properties" });

  const propertyTypeOptions = usePropertyTypesOptions();
  const propertyTypes = Object.values(propertyTypeOptions);

  const filteredPropertyTypes = useMemo(() => {
    const propertyBaseUris = properties.map((includedProperty) =>
      extractBaseUri(includedProperty.$id),
    );

    return propertyTypes.filter(
      (type) => !propertyBaseUris.includes(extractBaseUri(type.$id)),
    );
  }, [properties, propertyTypes]);

  return (
    <InsertTypeRow
      {...props}
      options={filteredPropertyTypes}
      variant="property"
    />
  );
};

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

  const cancelAddingNewProperty = () => {
    setAddingNewProperty(false);
    setSearchText("");
  };

  const modalTooltipId = useId();
  const createModalPopupState = usePopupState({
    variant: "popover",
    popupId: `createProperty-${modalTooltipId}`,
  });
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

  if (!addingNewProperty && fields.length === 0) {
    return (
      <EmptyListCard
        onClick={() => {
          setAddingNewProperty(true, () => {
            addingNewPropertyRef.current?.focus();
          });
        }}
        icon={<FontAwesomeIcon icon={faList} />}
        headline={<>Add a property</>}
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
            Allow arrays{" "}
            <QuestionIcon
              tooltip={
                <>
                  Allowing arrays permits the entry of more than one value for a
                  given property
                </>
              }
            />
          </EntityTypeTableCenteredCell>
          <EntityTypeTableCenteredCell>Required</EntityTypeTableCenteredCell>
          <TableCell />
        </EntityTypeTableHeaderRow>
      </TableHead>
      <TableBody>
        {fields.map(({ row, field, index }) => (
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
            property={row}
            propertyId={field.$id}
            flash={flashingRows.includes(field.$id)}
          />
        ))}
      </TableBody>
      <TableFooter>
        {addingNewProperty ? (
          <>
            <InsertPropertyRow
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
                        You should only create a new property type if you can't
                        find an existing one which corresponds to the
                        information you're trying to capture.
                      </>
                    }
                  />
                </>
              }
              popupState={createModalPopupState}
              onSubmit={handleSubmit}
              submitButtonProps={{ children: <>Create new property type</> }}
              getDefaultValues={() => ({
                expectedValues: [],
                ...(searchText.length ? { name: searchText } : {}),
              })}
            />
          </>
        ) : (
          <EntityTypeTableButtonRow
            icon={<StyledPlusCircleIcon />}
            onClick={() => {
              setAddingNewProperty(true, () => {
                addingNewPropertyRef.current?.focus();
              });
            }}
          >
            Add a property
          </EntityTypeTableButtonRow>
        )}
      </TableFooter>
    </EntityTypeTable>
  );
};
